"""
demo_video.py - Process video through SafeZone AI, send alerts to UI
"""

import argparse
import asyncio
import logging
import os
import sys
import time

import cv2
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger("safezone.demo")

CALL_TYPE         = os.getenv("CALL_TYPE", "default")
CALL_ID           = os.getenv("CALL_ID",   "safezone-live-demo")
STREAM_API_KEY    = os.getenv("STREAM_API_KEY")
STREAM_API_SECRET = os.getenv("STREAM_API_SECRET")
DEMO_USER_ID      = "safezone-demo"


async def process_video(video_path: str, rules: list, output_path: str, loop_video: bool = False):
    if not os.path.exists(video_path):
        logger.error(f"Video not found: {video_path}")
        return

    from getstream import Stream
    from getstream.models import UserRequest, CallRequest
    from agents.safety_processor import SafetyProcessor

    # Setup Stream
    client = Stream(api_key=STREAM_API_KEY, api_secret=STREAM_API_SECRET)
    client.upsert_users(UserRequest(id=DEMO_USER_ID, name="SafeZone Demo", role="admin"))
    call = client.video.call(CALL_TYPE, CALL_ID)
    call.get_or_create(data=CallRequest(created_by_id=DEMO_USER_ID))
    logger.info(f"✅ Stream ready: {CALL_TYPE}/{CALL_ID}")

    # Setup processor
    processor = SafetyProcessor(
        detection_fps=3,
        pose_fps=5,
        person_conf_threshold=0.45,
        object_conf_threshold=0.25,
    )

    for rule in rules:
        processor.add_custom_rule(rule)
        logger.info(f"📚 Rule: '{rule}'")

    all_alerts = []

    # Async send event wired correctly
    async def send_event(event: dict):
        try:
            if event.get("type") == "safety_alert":
                all_alerts.append(event)
                logger.warning(f"🚨 [{event['severity']}] {event['message']}")

            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: call.send_call_event(custom={"data": event}, user_id=DEMO_USER_ID)
            )
        except Exception as e:
            logger.debug(f"Event send error: {e}")

    processor._send_event = send_event

    # Open video
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        logger.error(f"Cannot open: {video_path}")
        return

    fps      = cap.get(cv2.CAP_PROP_FPS) or 25
    total    = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width    = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height   = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration = total / fps

    logger.info(f"📹 {width}x{height} @ {fps:.1f}fps | {duration:.1f}s | {total} frames")

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    logger.info("⏳ Loading YOLO models...")
    processor._load_models()
    logger.info("✅ Processing — open http://localhost:3000 to see alerts!")
    logger.info("=" * 60)

    frame_num  = 0
    start_time = time.time()

    while True:
        ret, frame = cap.read()

        # ── Video ended ───────────────────────────────────────────────────────
        if not ret:
            if loop_video:
                logger.info("🔁 Looping video...")
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                # Reset tracking so cooldowns don't suppress alerts on loop
                processor._tracked.clear()
                processor._cooldowns.clear()
                continue
            else:
                logger.info("✅ Video finished.")
                break

        frame_num += 1

        if frame_num % int(fps * 5) == 0:
            logger.info(
                f"Progress: {frame_num/total*100:.0f}% | "
                f"Frame {frame_num}/{total} | "
                f"Alerts: {len(all_alerts)}"
            )

        annotated = await processor.process(frame, None)
        writer.write(annotated)
        await asyncio.sleep(0)

    cap.release()
    writer.release()

    elapsed = time.time() - start_time
    logger.info("=" * 60)
    logger.info(f"✅ DONE | Frames: {frame_num} | Alerts: {len(all_alerts)} | Time: {elapsed:.1f}s")
    if output_path:
        logger.info(f"📼 Annotated video: {output_path}")

    if all_alerts:
        logger.info("\nALERT SUMMARY:")
        for i, a in enumerate(all_alerts, 1):
            t = time.strftime("%H:%M:%S", time.localtime(a["timestamp"]))
            logger.info(f"  {i}. [{a['severity']}] {a['message']} @ {t}")
    else:
        logger.info("No alerts fired.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--video",  required=True)
    parser.add_argument("--output", default="demo_output.mp4")
    parser.add_argument("--rules",  nargs="*", default=["watch for mobile phone", "watch for knife"])
    parser.add_argument("--loop",   action="store_true", help="Loop video continuously")
    args = parser.parse_args()

    print(f"\n{'='*60}")
    print(f"  SafeZone AI — Video Demo")
    print(f"  Video : {args.video}")
    print(f"  Rules : {args.rules}")
    print(f"  Loop  : {args.loop}")
    print(f"{'='*60}\n")

    asyncio.run(process_video(
        video_path  = args.video,
        rules       = args.rules,
        output_path = args.output,
        loop_video  = args.loop,
    ))