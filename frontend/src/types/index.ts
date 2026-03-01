// SafeZone AI — Shared TypeScript Types

export type AlertSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export interface SafetyAlert {
  alert_id:     number;
  timestamp:    number;
  severity:     AlertSeverity;
  message:      string;
  zone:         string;
  person_count: number;
  acknowledged: boolean;
  frame_b64?:   string;
}

export interface LiveStats {
  person_count:     number;
  total_alerts:     number;
  frames_processed: number;
  active_zones:     string[];
  timestamp:        number;
}

export interface IncidentReport {
  id:          string;
  generated_at: number;
  content:     string;
  severity:    AlertSeverity;
  zone:        string;
}

export interface DangerZone {
  name:   string;
  coords: [number, number, number, number]; // x1,y1,x2,y2 normalized
  active: boolean;
}

export type StreamEvent =
  | ({ type: "safety_alert" } & SafetyAlert)
  | ({ type: "live_stats"   } & LiveStats);
