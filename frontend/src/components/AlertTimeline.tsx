import React from "react";
import { formatDistanceToNow } from "date-fns";
import type { SafetyAlert, AlertSeverity } from "../types";

interface Props {
  alerts:        SafetyAlert[];
  onAcknowledge: (id: number) => void;
}

const SEVERITY_CONFIG: Record<AlertSeverity, { color: string; bg: string; dot: string; label: string }> = {
  CRITICAL: { color: "text-red-400",    bg: "bg-red-950/60 border-red-800",    dot: "bg-red-400 animate-pulse", label: "CRITICAL" },
  HIGH:     { color: "text-orange-400", bg: "bg-orange-950/60 border-orange-800", dot: "bg-orange-400",          label: "HIGH"     },
  MEDIUM:   { color: "text-yellow-400", bg: "bg-yellow-950/60 border-yellow-800", dot: "bg-yellow-400",          label: "MEDIUM"   },
  LOW:      { color: "text-blue-400",   bg: "bg-blue-950/60 border-blue-800",   dot: "bg-blue-400",             label: "LOW"      },
  INFO:     { color: "text-gray-400",   bg: "bg-gray-800/60 border-gray-700",   dot: "bg-gray-400",             label: "INFO"     },
};

export function AlertTimeline({ alerts, onAcknowledge }: Props) {
  const activeAlerts       = alerts.filter((a) => !a.acknowledged);
  const acknowledgedAlerts = alerts.filter((a) =>  a.acknowledged);

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <div className="w-14 h-14 rounded-full bg-green-900/30 border border-green-800 flex items-center justify-center mb-4">
          <span className="text-2xl">🛡</span>
        </div>
        <p className="text-green-400 font-semibold text-sm">All Clear</p>
        <p className="text-gray-600 text-xs mt-1">No alerts detected. Monitoring active.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Active alerts */}
      {activeAlerts.length > 0 && (
        <div className="shrink-0 px-3 pt-3 pb-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Active ({activeAlerts.length})
            </span>
          </div>
          <div className="space-y-2">
            {activeAlerts.map((alert) => (
              <AlertCard
                key={alert.alert_id}
                alert={alert}
                onAcknowledge={onAcknowledge}
              />
            ))}
          </div>
        </div>
      )}

      {/* Divider */}
      {acknowledgedAlerts.length > 0 && (
        <div className="mx-3 my-2 border-t border-gray-800" />
      )}

      {/* History */}
      {acknowledgedAlerts.length > 0 && (
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider block mb-2">
            History ({acknowledgedAlerts.length})
          </span>
          <div className="space-y-1.5">
            {acknowledgedAlerts.map((alert) => (
              <AlertCard
                key={alert.alert_id}
                alert={alert}
                onAcknowledge={onAcknowledge}
                dimmed
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AlertCard({
  alert,
  onAcknowledge,
  dimmed = false,
}: {
  alert:         SafetyAlert;
  onAcknowledge: (id: number) => void;
  dimmed?:       boolean;
}) {
  const cfg = SEVERITY_CONFIG[alert.severity];
  const ago = formatDistanceToNow(new Date(alert.timestamp * 1000), { addSuffix: true });

  return (
    <div
      className={`rounded-lg border p-3 transition-all ${cfg.bg} ${
        dimmed ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-2 h-2 rounded-full shrink-0 mt-0.5 ${cfg.dot}`} />
          <span className={`text-xs font-bold ${cfg.color}`}>{cfg.label}</span>
        </div>
        <span className="text-xs text-gray-600 shrink-0">{ago}</span>
      </div>

      <p className="text-xs text-gray-200 mt-1.5 leading-relaxed">{alert.message}</p>

      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-600">
          📍 {alert.zone} · {alert.person_count} person{alert.person_count !== 1 ? "s" : ""}
        </span>
        {!dimmed && (
          <button
            onClick={() => onAcknowledge(alert.alert_id)}
            className="text-xs text-gray-500 hover:text-green-400 transition-colors font-medium"
          >
            ✓ Ack
          </button>
        )}
      </div>
    </div>
  );
}
