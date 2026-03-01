import { useCallback, useEffect, useRef, useState } from "react";
import type { Call } from "@stream-io/video-react-sdk";
import type { SafetyAlert, LiveStats } from "../types";

const CRITICAL_EXPIRY_MS = 20_000;

export function useSafetyEvents(call: Call | null) {
  const [alerts, setAlerts]                 = useState<SafetyAlert[]>([]);
  const [liveStats, setLiveStats]           = useState<LiveStats | null>(null);
  const [criticalActive, setCriticalActive] = useState(false);
  const [agentOnline, setAgentOnline]       = useState(false);
  const criticalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addAlert = useCallback((alert: SafetyAlert) => {
    setAlerts(prev => [alert, ...prev].slice(0, 100));
    if (alert.severity === "CRITICAL") {
      setCriticalActive(true);
      if (criticalTimer.current) clearTimeout(criticalTimer.current);
      criticalTimer.current = setTimeout(() => setCriticalActive(false), CRITICAL_EXPIRY_MS);
    }
    if (["CRITICAL","HIGH"].includes(alert.severity) && Notification.permission === "granted") {
      new Notification(`SafeZone AI — ${alert.severity}`, { body: alert.message });
    }
  }, []);

  const acknowledgeAlert = useCallback((alertId: number) => {
    setAlerts(prev => prev.map(a => a.alert_id === alertId ? { ...a, acknowledged: true } : a));
  }, []);

  useEffect(() => {
    if (!call) return;
    if (Notification.permission === "default") Notification.requestPermission();

    const unsubscribe = call.on("custom", (event: any) => {
      // Stream SDK wraps data as: event.custom.data OR event.custom directly
      const raw  = event?.custom ?? event;
      const data = raw?.data ?? raw;
      if (!data?.type) return;

      console.log("📡 SafeZone event:", data); // helpful for debugging

      if (data.type === "safety_alert") {
        setAgentOnline(true);
        addAlert({
          alert_id:     data.alert_id     ?? Date.now(),
          timestamp:    data.timestamp    ?? Date.now() / 1000,
          severity:     data.severity     ?? "INFO",
          message:      data.message      ?? "Unknown alert",
          zone:         data.zone         ?? "general",
          person_count: data.person_count ?? 0,
          acknowledged: false,
        });
      }

      if (data.type === "live_stats") {
        setAgentOnline(true);
        setLiveStats({
          person_count:     data.person_count     ?? 0,
          total_alerts:     data.total_alerts     ?? 0,
          frames_processed: data.frames_processed ?? 0,
          active_zones:     data.active_zones     ?? [],
          timestamp:        data.timestamp        ?? Date.now() / 1000,
        });
      }
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
      if (criticalTimer.current) clearTimeout(criticalTimer.current);
    };
  }, [call, addAlert]);

  return { alerts, liveStats, criticalActive, agentOnline, acknowledgeAlert };
}