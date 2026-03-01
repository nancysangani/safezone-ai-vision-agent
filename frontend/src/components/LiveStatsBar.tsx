import React from "react";
import type { LiveStats } from "../types";

interface Props {
  stats:      LiveStats | null;
  alertCount: number;
}

export function LiveStatsBar({ stats, alertCount }: Props) {
  return (
    <div className="bg-gray-900/80 border-b border-gray-800 px-6 py-2 flex items-center gap-6 text-xs">
      <Stat
        icon="👤"
        label="Persons"
        value={stats?.person_count ?? 0}
        highlight={stats?.person_count ? stats.person_count > 3 : false}
      />
      <Stat
        icon="🚨"
        label="Total Alerts"
        value={alertCount}
        highlight={alertCount > 0}
      />
      <Stat
        icon="🎞"
        label="Frames"
        value={stats ? `${(stats.frames_processed / 1000).toFixed(1)}k` : "—"}
      />
      <Stat
        icon="📍"
        label="Active Zones"
        value={stats?.active_zones.length ?? 0}
        highlight={stats ? stats.active_zones.length > 0 : false}
      />
      <div className="ml-auto flex items-center gap-2 text-gray-600">
        <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        <span>SafeZone AI Active</span>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  highlight = false,
}: {
  icon:       string;
  label:      string;
  value:      string | number;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm">{icon}</span>
      <span className="text-gray-600">{label}:</span>
      <span className={`font-bold ${highlight ? "text-red-400" : "text-gray-300"}`}>
        {value}
      </span>
    </div>
  );
}
