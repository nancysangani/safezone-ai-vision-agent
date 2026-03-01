"""
SafetyProcessor — Custom Vision Agents Processor

Real detections using YOLO11 COCO classes:
  - Person (class 0)        → zone breach, fall detection, crowd
  - Cell phone (class 67)   → mobile phone rule
  - Backpack (class 24)     → bag/item detection
  - Bottle (class 39)       → item detection
  - Knife (class 43)        → weapon detection (CRITICAL)

Teach Mode rules dynamically enable/disable object detections.
"""

import logging
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from vision_agents.core.processors.base_processor import Processor

logger = logging.getLogger("safezone.processor")

# ── COCO class IDs relevant to workplace safety ────────────────────────────────
COCO_CLASSES = {
    0:  "person",
    24: "backpack",
    26: "handbag",
    28: "suitcase",
    39: "bottle",
    41: "cup",
    43: "knife",
    63: "laptop",
    64: "mouse",
    66: "keyboard",
    67: "cell phone",
    73: "book",
}

PERSON_CLASS     = 0
CELL_PHONE_CLASS = 67
KNIFE_CLASS      = 43
LAPTOP_CLASS     = 63

SEVERITY_ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "INFO": 4}

# ── Teach mode keyword → COCO class mapping ────────────────────────────────────
RULE_CLASS_MAP = {
    "mobile phone":  CELL_PHONE_CLASS,
    "cell phone":    CELL_PHONE_CLASS,
    "phone":         CELL_PHONE_CLASS,
    "mobile":        CELL_PHONE_CLASS,
    "knife":         KNIFE_CLASS,
    "weapon":        KNIFE_CLASS,
    "laptop":        LAPTOP_CLASS,
    "computer":      LAPTOP_CLASS,
    "bag":           24,
    "backpack":      24,
    "bottle":        39,
    "drink":         39,
}


@dataclass
class TrackedPerson:
    person_id:        int
    first_seen:       float = field(default_factory=time.time)
    last_seen:        float = field(default_factory=time.time)
    last_bbox:        Tuple = (0, 0, 0, 0)
    is_stationary:    bool  = False
    stationary_since: Optional[float] = None
    zone:             str   = "general"

    def update(self, bbox: Tuple) -> None:
        now      = time.time()
        movement = self._movement(self.last_bbox, bbox)
        self.last_bbox = bbox
        self.last_seen = now
        if movement < 15:
            if not self.is_stationary:
                self.is_stationary    = True
                self.stationary_since = now
        else:
            self.is_stationary    = False
            self.stationary_since = None

    @property
    def stationary_duration(self) -> float:
        if self.is_stationary and self.stationary_since:
            return time.time() - self.stationary_since
        return 0.0

    @staticmethod
    def _movement(b1: Tuple, b2: Tuple) -> float:
        if not b1 or not b2:
            return 999.0
        return (((b2[0]+b2[2])/2 - (b1[0]+b1[2])/2)**2
              + ((b2[1]+b2[3])/2 - (b1[1]+b1[3])/2)**2) ** 0.5


@dataclass
class Alert:
    timestamp:    float
    severity:     str
    message:      str
    zone:         str
    person_count: int


class SafetyProcessor(Processor):

    @property
    def name(self) -> str:
        return "SafetyProcessor"

    async def close(self) -> None:
        logger.info("SafetyProcessor closing...")
        self._pose_model   = None
        self._detect_model = None

    def __init__(
        self,
        detection_fps:         int   = 3,
        pose_fps:              int   = 5,
        person_conf_threshold: float = 0.55,
        object_conf_threshold: float = 0.25,
        call_id:               str   = "safezone-live-demo",
    ):
        self.detection_fps         = detection_fps
        self.pose_fps              = pose_fps
        self.person_conf_threshold = person_conf_threshold
        self.object_conf_threshold = object_conf_threshold
        self.call_id               = call_id

        self._pose_model   = None
        self._detect_model = None
        self._agent        = None
        self._call_ref     = None  # Direct call reference for sending events

        self._last_detect_t   = 0.0
        self._last_pose_t     = 0.0
        self._detect_interval = 1.0 / detection_fps
        self._pose_interval   = 1.0 / pose_fps

        self._tracked:   Dict[int, TrackedPerson] = {}
        self._history:   deque                    = deque(maxlen=200)
        self._cooldowns: Dict[str, float]         = {}
        self._rules:     List[str]                = []

        # ── Active object watch classes from Teach Mode ───────────────────────
        # Maps COCO class_id → rule description
        self._watch_objects: Dict[int, str] = {
            KNIFE_CLASS: "weapon/knife detected",  # Always watch for weapons
        }

        self._zones: List[Dict] = [
            {"name": "Restricted Zone A", "coords": (0.65, 0.0, 1.0, 0.5)},
        ]

        self.stats = {
            "total_alerts":     0,
            "frames_processed": 0,
            "persons_detected": 0,
        }
        logger.info("SafetyProcessor initialized ✅")

    def attach_agent(self, agent: Any) -> None:
        """
        CRITICAL: Must be called after Agent() is created.
        Enables voice alerts via agent.llm.simple_response().
        """
        self._agent = agent
        logger.info(f"✅ SafetyProcessor attached to agent — voice alerts enabled")

    def _load_models(self) -> None:
        if self._pose_model is None:
            from ultralytics import YOLO
            logger.info("⏳ Loading YOLO11 pose model...")
            self._pose_model = YOLO("yolo11n-pose.pt")
            logger.info("✅ Pose model ready")
        if self._detect_model is None:
            from ultralytics import YOLO
            logger.info("⏳ Loading YOLO11 detection model...")
            self._detect_model = YOLO("yolo11n.pt")
            logger.info("✅ Detection model ready")

    # ── Main SDK hook ──────────────────────────────────────────────────────────

    async def process(self, frame: np.ndarray, context: Any) -> np.ndarray:
        logger.info(f"PROCESS CALLED - frame shape: {frame.shape}")
        self._load_models()
        self.stats["frames_processed"] += 1
        now       = time.time()
        annotated = frame.copy()

        if now - self._last_pose_t >= self._pose_interval:
            self._last_pose_t = now
            try:
                pose_results = self._pose_model(frame, verbose=False, conf=0.4)
                if pose_results and pose_results[0].keypoints is not None:
                    annotated = pose_results[0].plot(
                        boxes=False, masks=False, labels=False, conf=False
                    )
            except Exception as e:
                logger.debug(f"Pose error: {e}")

        if now - self._last_detect_t >= self._detect_interval:
            self._last_detect_t = now
            await self._run_detection(frame, context)

        return self._draw_zones(annotated)

    async def _run_detection(self, frame: np.ndarray, context: Any) -> None:
        h, w = frame.shape[:2]
        try:
            results = self._detect_model(frame, verbose=False, conf=0.3)
        except Exception as e:
            logger.debug(f"Detection error: {e}")
            return

        persons:          List[Dict] = []
        detected_objects: List[Dict] = []
        seen: set = set()

        if results and results[0].boxes is not None:
            for i, box in enumerate(results[0].boxes):
                cls_id = int(box.cls)
                conf   = float(box.conf)
                x1, y1, x2, y2 = map(float, box.xyxy[0])

                # ── Person detection ──────────────────────────────────────────
                if cls_id == PERSON_CLASS and conf >= self.person_conf_threshold:
                    zone = self._get_zone(x1/w, y1/h, x2/w, y2/h)
                    if i not in self._tracked:
                        self._tracked[i] = TrackedPerson(person_id=i, zone=zone)
                    self._tracked[i].update((x1, y1, x2, y2))
                    seen.add(i)
                    persons.append({
                        "id":              i,
                        "bbox":            (x1, y1, x2, y2),
                        "conf":            conf,
                        "zone":            zone,
                        "stationary_secs": self._tracked[i].stationary_duration,
                    })

                # ── Teach Mode object detection ───────────────────────────────
                elif cls_id in self._watch_objects and conf >= self.object_conf_threshold:
                    class_name = COCO_CLASSES.get(cls_id, f"object_{cls_id}")
                    zone       = self._get_zone(x1/w, y1/h, x2/w, y2/h)
                    detected_objects.append({
                        "cls_id":     cls_id,
                        "class_name": class_name,
                        "conf":       conf,
                        "zone":       zone,
                        "rule_desc":  self._watch_objects[cls_id],
                    })

        # Prune stale tracked persons
        for k in [k for k in self._tracked if k not in seen]:
            del self._tracked[k]

        self.stats["persons_detected"] = len(persons)

        # Evaluate rules
        for alert in self._evaluate_person_rules(persons):
            await self._emit_alert(alert, context)

        for alert in self._evaluate_object_rules(detected_objects, len(persons)):
            await self._emit_alert(alert, context)

        await self._emit_stats(persons, context)

    def _evaluate_person_rules(self, persons: List[Dict]) -> List[Alert]:
        alerts: List[Alert] = []
        now = time.time()

        for p in persons:
            if p["stationary_secs"] >= 8.0 and self._cooldown_ok(f"down_{p['id']}", 15):
                alerts.append(Alert(now, "CRITICAL",
                    f"Person may be down — stationary {p['stationary_secs']:.0f}s in {p['zone']}",
                    p["zone"], len(persons)))

            if p["zone"] != "general" and self._cooldown_ok(f"zone_{p['id']}_{p['zone']}", 30):
                alerts.append(Alert(now, "HIGH",
                    f"Unauthorized access detected in {p['zone']}",
                    p["zone"], len(persons)))

        if len(persons) > 4 and self._cooldown_ok("crowd", 60):
            alerts.append(Alert(now, "MEDIUM",
                f"High crowd density — {len(persons)} people detected",
                "general", len(persons)))

        return alerts

    def _evaluate_object_rules(self, objects: List[Dict], person_count: int) -> List[Alert]:
        """Fire alerts for Teach Mode object detections."""
        alerts: List[Alert] = []
        now = time.time()

        for obj in objects:
            cls_id = obj["cls_id"]
            name   = obj["class_name"]
            zone   = obj["zone"]
            conf   = obj["conf"]

            cooldown_key = f"obj_{cls_id}_{zone}"

            if cls_id == KNIFE_CLASS:
                if self._cooldown_ok(cooldown_key, 20):
                    alerts.append(Alert(now, "CRITICAL",
                        f"⚠️ Weapon detected — {name} visible in {zone} (conf: {conf:.0%})",
                        zone, person_count))

            elif cls_id == CELL_PHONE_CLASS:
                if self._cooldown_ok(cooldown_key, 20):
                    alerts.append(Alert(now, "HIGH",
                        f"Policy violation — person using {name} in monitored area (conf: {conf:.0%})",
                        zone, person_count))

            else:
                if self._cooldown_ok(cooldown_key, 30):
                    alerts.append(Alert(now, "MEDIUM",
                        f"Teach Mode: {name} detected in {zone} (conf: {conf:.0%})",
                        zone, person_count))

        return alerts

    def _cooldown_ok(self, key: str, secs: float) -> bool:
        now = time.time()
        if now - self._cooldowns.get(key, 0) >= secs:
            self._cooldowns[key] = now
            return True
        return False

    def _get_zone(self, x1n: float, y1n: float, x2n: float, y2n: float) -> str:
        cx, cy = (x1n+x2n)/2, (y1n+y2n)/2
        for zone in self._zones:
            zx1, zy1, zx2, zy2 = zone["coords"]
            if zx1 <= cx <= zx2 and zy1 <= cy <= zy2:
                return zone["name"]
        return "general"

    def _draw_zones(self, frame: np.ndarray) -> np.ndarray:
        try:
            import cv2
            h, w = frame.shape[:2]
            for zone in self._zones:
                zx1, zy1, zx2, zy2 = zone["coords"]
                x1, y1 = int(zx1*w), int(zy1*h)
                x2, y2 = int(zx2*w), int(zy2*h)
                overlay = frame.copy()
                cv2.rectangle(overlay, (x1,y1), (x2,y2), (0,0,220), -1)
                cv2.addWeighted(overlay, 0.18, frame, 0.82, 0, frame)
                cv2.rectangle(frame, (x1,y1), (x2,y2), (0,0,220), 2)
                cv2.putText(frame, zone["name"], (x1+4, y1+18),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255,255,255), 1)
        except Exception as e:
            logger.debug(f"Zone draw error: {e}")
        return frame

    # ── Event emission ─────────────────────────────────────────────────────────

    async def _emit_alert(self, alert: Alert, context: Any) -> None:
        self.stats["total_alerts"] += 1
        self._history.append(alert)
        logger.warning(f"🚨 [{alert.severity}] {alert.message}")

        event = {
            "type":         "safety_alert",
            "alert_id":     self.stats["total_alerts"],
            "timestamp":    alert.timestamp,
            "severity":     alert.severity,
            "message":      alert.message,
            "zone":         alert.zone,
            "person_count": alert.person_count,
        }
        await self._send_event(event)

        # ── FIX: Voice alert via agent.llm ────────────────────────────────────
        if SEVERITY_ORDER.get(alert.severity, 99) <= SEVERITY_ORDER["HIGH"]:
            if self._agent is not None and hasattr(self._agent, "llm"):
                try:
                    await self._agent.llm.simple_response(
                        text=f"Safety alert: {alert.message}"
                    )
                except Exception as e:
                    logger.debug(f"LLM voice error: {e}")
            else:
                logger.debug("Voice alert skipped — agent not attached yet")

    async def _emit_stats(self, persons: List[Dict], context: Any) -> None:
        event = {
            "type":             "live_stats",
            "timestamp":        time.time(),
            "person_count":     len(persons),
            "total_alerts":     self.stats["total_alerts"],
            "frames_processed": self.stats["frames_processed"],
            "active_zones":     [p["zone"] for p in persons if p["zone"] != "general"],
        }
        await self._send_event(event)

    async def _send_event(self, event: Dict) -> None:
        # Try _call_ref first (most reliable — set directly in join_call)
        if self._call_ref:
            try:
                await self._call_ref.send_custom_event({"data": event})
                return
            except Exception as e:
                logger.debug(f"send_event via _call_ref: {e}")

        # Fallback: try agent call attributes
        for attr in ["_call", "call"]:
            try:
                c = getattr(self._agent, attr, None)
                if c:
                    await c.send_custom_event({"data": event})
                    return
            except Exception as e:
                logger.debug(f"send_event via {attr}: {e}")

    # ── Public API ─────────────────────────────────────────────────────────────

    def add_custom_rule(self, rule: str) -> None:
        """
        Parse rule text and enable the matching COCO class detection.
        Called by:
        - Frontend via custom event (teach_mode_rule)
        - Voice via Gemini tool call (add_watch_rule)
        """
        self._rules.append(rule)
        rule_lower = rule.lower()

        matched = False
        for keyword, cls_id in RULE_CLASS_MAP.items():
            if keyword in rule_lower:
                self._watch_objects[cls_id] = rule
                class_name = COCO_CLASSES.get(cls_id, "object")
                logger.info(
                    f"📚 Teach Mode ACTIVE: '{rule}' → "
                    f"COCO class {cls_id} ({class_name}) now being detected"
                )
                matched = True
                break

        if not matched:
            # Store as context rule — Gemini will reason about it
            logger.info(f"📚 Teach Mode: '{rule}' → stored as context rule (no COCO match)")

        # Always log current watch list
        watching = [COCO_CLASSES.get(c, str(c)) for c in self._watch_objects]
        logger.info(f"👁️  Currently watching: {watching}")

    def get_recent_alerts(self, n: int = 10) -> List[Dict]:
        return [
            {"timestamp": a.timestamp, "severity": a.severity,
             "message": a.message, "zone": a.zone}
            for a in list(self._history)[-n:]
        ]

    def add_danger_zone(self, name: str, x1: float, y1: float, x2: float, y2: float) -> None:
        self._zones.append({"name": name, "coords": (x1, y1, x2, y2)})
        logger.info(f"🗺️  Zone added: {name}")

    def get_stats_snapshot(self) -> Dict:
        return {
            **self.stats,
            "tracked_persons":  len(self._tracked),
            "custom_rules":     len(self._rules),
            "danger_zones":     len(self._zones),
            "watching_objects": [COCO_CLASSES.get(c, str(c)) for c in self._watch_objects],
        }