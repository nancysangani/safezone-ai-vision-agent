import React from "react";

interface Props {
  joined:        boolean;
  joining:       boolean;
  criticalActive: boolean;
}

export function StatusBadge({ joined, joining, criticalActive }: Props) {
  if (criticalActive) {
    return (
      <div className="flex items-center gap-2 bg-red-900/60 border border-red-700 rounded-full px-3 py-1">
        <div className="w-2 h-2 rounded-full bg-red-400 animate-ping" />
        <span className="text-xs font-bold text-red-300">CRITICAL ALERT</span>
      </div>
    );
  }

  if (joining) {
    return (
      <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-full px-3 py-1">
        <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
        <span className="text-xs text-gray-400">Connecting...</span>
      </div>
    );
  }

  if (joined) {
    return (
      <div className="flex items-center gap-2 bg-green-900/40 border border-green-800 rounded-full px-3 py-1">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="text-xs text-green-400 font-medium">Monitoring Live</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-full px-3 py-1">
      <div className="w-2 h-2 rounded-full bg-gray-500" />
      <span className="text-xs text-gray-500">Offline</span>
    </div>
  );
}
