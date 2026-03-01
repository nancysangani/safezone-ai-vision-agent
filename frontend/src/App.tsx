import React, { useState, useEffect } from "react";
import {
  StreamVideo,
  StreamVideoClient,
  StreamCall,
  useCall,
  useCallStateHooks,
  ParticipantView,
} from "@stream-io/video-react-sdk";
import "@stream-io/video-react-sdk/dist/css/styles.css";

import { AlertTimeline }   from "./components/AlertTimeline";
import { LiveStatsBar }    from "./components/LiveStatsBar";
import { IncidentPanel }   from "./components/IncidentPanel";
import { TeachModePanel }  from "./components/TeachModePanel";
import { StatusBadge }     from "./components/StatusBadge";
import { useSafetyEvents } from "./hooks/useSafetyEvents";

const API_KEY    = import.meta.env.VITE_STREAM_API_KEY as string;
const USER_ID    = import.meta.env.VITE_USER_ID        as string;
const USER_TOKEN = import.meta.env.VITE_USER_TOKEN     as string;
const CALL_ID    = import.meta.env.VITE_CALL_ID        as string;
const CALL_TYPE  = import.meta.env.VITE_CALL_TYPE      as string;

const client = new StreamVideoClient({
  apiKey: API_KEY,
  user: { id: USER_ID, name: "SafeZone Operator" },
  token: USER_TOKEN,
});
const call = client.call(CALL_TYPE, CALL_ID);

export default function App() {
  return (
    <StreamVideo client={client}>
      <StreamCall call={call}>
        <SafeZoneDashboard />
      </StreamCall>
    </StreamVideo>
  );
}

// ── Demo alert definitions ────────────────────────────────────────────────────
const DEMO_ALERTS = [
  { label: "🔴 Person Down",     severity: "CRITICAL", message: "Person may be down — stationary 12s in Restricted Zone A", zone: "Restricted Zone A", person_count: 1 },
  { label: "🟠 Zone Breach",     severity: "HIGH",     message: "Unauthorized access detected in Restricted Zone A",        zone: "Restricted Zone A", person_count: 1 },
  { label: "🟠 No Hard Hat",     severity: "HIGH",     message: "Person detected without PPE — no hard hat in Zone B",      zone: "Zone B",            person_count: 1 },
  { label: "🟡 Crowd Density",   severity: "MEDIUM",   message: "High crowd density — 6 people detected",                  zone: "general",           person_count: 6 },
  { label: "🟡 Unsafe Behaviour",severity: "MEDIUM",   message: "Unsafe behaviour — person running near machinery",         zone: "Zone C",            person_count: 1 },
];

let demoAlertId = 200;

// ── Main Dashboard ────────────────────────────────────────────────────────────
function SafeZoneDashboard() {
  const myCall = useCall()!;
  const { useRemoteParticipants } = useCallStateHooks();
  const remoteParticipants = useRemoteParticipants();

  const { alerts, liveStats, criticalActive, agentOnline, acknowledgeAlert } = useSafetyEvents(myCall);

  const [activeTab, setActiveTab] = useState<"monitor"|"incidents"|"teach"|"demo">("monitor");
  const [joined,    setJoined]    = useState(false);
  const [joining,   setJoining]   = useState(false);
  const [firing,    setFiring]    = useState<string|null>(null);
  const [personCount, setPersonCount] = useState(0);

  useEffect(() => {
    const join = async () => {
      setJoining(true);
      try   { await myCall.join({ create: true }); setJoined(true); }
      catch  (e) { console.error(e); }
      finally    { setJoining(false); }
    };
    join();
    return () => { myCall.leave().catch(() => {}); };
  }, []); // eslint-disable-line

  const agentParticipant = remoteParticipants.find(p => p.userId === "safezone-agent");

  // ── Send a custom event directly from UI ───────────────────────────────────
  const fireAlert = async (alert: typeof DEMO_ALERTS[0]) => {
    setFiring(alert.label);
    demoAlertId++;
    try {
      await myCall.sendCustomEvent({
        data: {
          type:         "safety_alert",
          alert_id:     demoAlertId,
          timestamp:    Date.now() / 1000,
          severity:     alert.severity,
          message:      alert.message,
          zone:         alert.zone,
          person_count: alert.person_count,
        }
      });
    } catch (e) { console.error(e); }
    finally { setFiring(null); }
  };

  const updatePersonCount = async (count: number) => {
    setPersonCount(count);
    try {
      await myCall.sendCustomEvent({
        data: {
          type:             "live_stats",
          timestamp:        Date.now() / 1000,
          person_count:     count,
          total_alerts:     alerts.length,
          frames_processed: Math.floor(Math.random() * 9999) + 1000,
          active_zones:     count > 0 ? ["Restricted Zone A"] : [],
        }
      });
    } catch (e) { console.error(e); }
  };

  const runFullSequence = async () => {
    setFiring("sequence");
    for (const alert of [DEMO_ALERTS[1], DEMO_ALERTS[0], DEMO_ALERTS[3]]) {
      await fireAlert(alert);
      await new Promise(r => setTimeout(r, 2500));
    }
    setFiring(null);
  };

  const tabs = [
    { id: "monitor",   label: "🛡 Alerts" },
    { id: "incidents", label: "📋 Reports" },
    { id: "teach",     label: "🧠 Teach" },
    { id: "demo",      label: "🎮 Demo" },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">

      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-600 flex items-center justify-center font-bold text-white text-sm">SZ</div>
          <div>
            <h1 className="text-lg font-bold text-white leading-tight">SafeZone AI</h1>
            <p className="text-xs text-gray-400">Real-Time Safety Intelligence</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <StatusBadge joined={joined} joining={joining} criticalActive={criticalActive} />
          <span className="text-xs text-gray-400 hidden sm:block">
            {liveStats ? `${liveStats.person_count} person${liveStats.person_count !== 1 ? "s" : ""} detected` : "No feed"}
          </span>
        </div>
      </header>

      {/* Stats Bar */}
      <LiveStatsBar stats={liveStats} alertCount={alerts.length} />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">

        {/* Video Feed */}
        <div className={`flex-1 bg-black relative flex items-center justify-center transition-all duration-300 ${criticalActive ? "ring-4 ring-red-500 ring-inset" : ""}`}>
          {criticalActive && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-6 py-2 rounded-full font-bold text-sm animate-pulse shadow-lg shadow-red-900">
              ⚠ CRITICAL ALERT ACTIVE
            </div>
          )}
          {joining && (
            <div className="text-gray-400 text-sm flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
              Connecting to SafeZone AI...
            </div>
          )}
          {joined && !agentParticipant && (
            <div className="text-gray-500 text-sm flex flex-col items-center gap-2">
              <span className="text-4xl">📹</span>
              <span>Waiting for agent video feed...</span>
              <span className="text-xs text-gray-600">Start backend agent to connect</span>
            </div>
          )}
          {agentParticipant && (
            <ParticipantView participant={agentParticipant} className="w-full h-full object-contain" ParticipantViewUI={null} />
          )}
          {joined && (
            <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur rounded px-3 py-1.5 text-xs text-gray-300 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Live • &lt;30ms latency
            </div>
          )}
        </div>

        {/* Right Panel */}
        <div className="w-96 bg-gray-900 border-l border-gray-800 flex flex-col">
          {/* Tabs */}
          <div className="flex border-b border-gray-800">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  activeTab === tab.id
                    ? "text-red-400 border-b-2 border-red-400 bg-gray-800/50"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === "monitor"   && <AlertTimeline alerts={alerts} onAcknowledge={acknowledgeAlert} />}
            {activeTab === "incidents" && <IncidentPanel alerts={alerts} call={myCall} />}
            {activeTab === "teach"     && <TeachModePanel call={myCall} />}
            {activeTab === "demo"      && (
              <div className="flex flex-col h-full overflow-y-auto p-4 space-y-5">

                <div>
                  <h3 className="text-sm font-bold text-white">🎮 Demo Control Panel</h3>
                  <p className="text-xs text-gray-500 mt-1">Fire alerts directly from UI — no camera needed.</p>
                </div>

                {/* Full sequence button */}
                <button
                  onClick={runFullSequence}
                  disabled={firing !== null}
                  className="w-full py-3 rounded-lg bg-gradient-to-r from-red-700 to-orange-700 hover:from-red-600 hover:to-orange-600 disabled:opacity-40 text-white font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2"
                >
                  {firing === "sequence" ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Running sequence...</>
                  ) : "▶ Run Full Demo Sequence"}
                </button>
                <p className="text-xs text-gray-600 text-center -mt-3">Zone Breach → Person Down → Crowd (2.5s apart)</p>

                {/* Person count */}
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Person Count</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[0,1,3,6].map(n => (
                      <button
                        key={n}
                        onClick={() => updatePersonCount(n)}
                        className={`py-2 rounded text-xs font-medium transition-colors border ${
                          personCount === n
                            ? "bg-blue-700 border-blue-500 text-white"
                            : "bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700"
                        }`}
                      >
                        {n} {n === 1 ? "person" : "people"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Individual alerts */}
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Fire Individual Alert</p>
                  <div className="space-y-2">
                    {DEMO_ALERTS.map(alert => (
                      <button
                        key={alert.label}
                        onClick={() => fireAlert(alert)}
                        disabled={firing !== null}
                        className={`w-full text-left px-3 py-2.5 rounded-lg border text-xs font-medium transition-all disabled:opacity-40 flex items-center justify-between ${
                          alert.severity === "CRITICAL" ? "bg-red-900/40 border-red-800 hover:bg-red-900/70 text-red-300" :
                          alert.severity === "HIGH"     ? "bg-orange-900/40 border-orange-800 hover:bg-orange-900/70 text-orange-300" :
                                                          "bg-yellow-900/40 border-yellow-800 hover:bg-yellow-900/70 text-yellow-300"
                        }`}
                      >
                        <span>{alert.label}</span>
                        {firing === alert.label
                          ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                          : <span className="text-gray-600 text-xs">fire →</span>
                        }
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}