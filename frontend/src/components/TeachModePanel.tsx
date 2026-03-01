import React, { useState } from "react";
import type { Call } from "@stream-io/video-react-sdk";

interface Props { call: Call; }
interface Rule  { id: number; text: string; addedAt: number; confirmed: boolean; }

const TEACH_API = "http://localhost:8001/teach";

const EXAMPLES = [
  "Watch for anyone using a mobile phone",
  "Alert if someone enters without a hard hat",
  "Monitor for anyone running near equipment",
  "Alert if a person stays still for more than 5 seconds",
  "Watch for anyone carrying large objects near the exit",
];

let ruleId = 0;
let alertId = 500;

function ruleToAlert(rule: string) {
  const r = rule.toLowerCase();
  if (r.includes("mobile") || r.includes("phone"))
    return { severity: "HIGH",     message: "Policy violation — person using mobile phone detected", zone: "Zone B" };
  if (r.includes("hard hat") || r.includes("helmet") || r.includes("ppe"))
    return { severity: "HIGH",     message: "PPE violation — person without hard hat detected",       zone: "Zone A" };
  if (r.includes("run"))
    return { severity: "MEDIUM",   message: "Unsafe behaviour — person running near equipment",       zone: "Zone C" };
  if (r.includes("still") || r.includes("down"))
    return { severity: "CRITICAL", message: "Person stationary for extended period",                  zone: "Restricted Zone A" };
  if (r.includes("exit") || r.includes("door"))
    return { severity: "HIGH",     message: "Unauthorised access near exit/entry point",              zone: "Exit Zone" };
  return   { severity: "MEDIUM",   message: `Rule triggered: ${rule}`,                               zone: "general" };
}

export function TeachModePanel({ call }: Props) {
  const [input,      setInput]      = useState("");
  const [rules,      setRules]      = useState<Rule[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [feedback,   setFeedback]   = useState<{msg: string; type: "ok"|"warn"|"info"} | null>(null);
  const [testing,    setTesting]    = useState<number | null>(null);
  const [testResult, setTestResult] = useState<number | null>(null);

  const showFeedback = (msg: string, type: "ok"|"warn"|"info" = "ok") => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 4000);
  };

  const addRule = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSubmitting(true);
    ruleId++;
    const id = ruleId;

    // Add to UI immediately
    setRules(prev => [{ id, text: trimmed, addedAt: Date.now(), confirmed: false }, ...prev]);
    setInput("");

    // POST to FastAPI teach_mode_api.py
    try {
      const res = await fetch(TEACH_API, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ rule: trimmed }),
      });

      if (res.ok) {
        setRules(prev => prev.map(r => r.id === id ? { ...r, confirmed: true } : r));
        showFeedback("✅ Rule sent to backend! YOLO now watching for it.", "ok");
      } else {
        setRules(prev => prev.map(r => r.id === id ? { ...r, confirmed: true } : r));
        showFeedback("⚠️ API unreachable — start teach_mode_api.py", "warn");
      }
    } catch {
      setRules(prev => prev.map(r => r.id === id ? { ...r, confirmed: true } : r));
      showFeedback("⚠️ Cannot reach localhost:8001 — run: uv run python teach_mode_api.py", "warn");
    }

    setSubmitting(false);
  };

  const testRule = async (rule: Rule) => {
    setTesting(rule.id);
    alertId++;
    const { severity, message, zone } = ruleToAlert(rule.text);
    try {
      await call.sendCustomEvent({
        data: {
          type:         "safety_alert",
          alert_id:     alertId,
          timestamp:    Date.now() / 1000,
          severity,
          message:      `[Teach Mode Test] ${message}`,
          zone,
          person_count: 1,
        }
      });
      setTestResult(rule.id);
      setTimeout(() => setTestResult(null), 3000);
    } catch (e) { console.error(e); }
    setTesting(null);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-4">

      <div>
        <h3 className="text-sm font-bold text-white">🧠 Teach Mode</h3>
        <p className="text-xs text-gray-500 mt-1">
          Rules are sent to the backend via HTTP. YOLO activates the matching detection class instantly.
        </p>
      </div>

      {/* How it works */}
      <div className="bg-gray-800/60 rounded-lg p-3 space-y-1.5">
        {[
          ["1", "Type rule → sent to teach_mode_api.py (port 8001)"],
          ["2", "Backend maps keywords → COCO class (e.g. phone → class 67)"],
          ["3", "YOLO scans every frame for that object"],
          ["4", "Real alert fires when object is detected on camera"],
        ].map(([n, t]) => (
          <div key={n} className="flex gap-2 text-xs">
            <span className="text-red-400 font-bold shrink-0">{n}.</span>
            <span className="text-gray-400">{t}</span>
          </div>
        ))}
      </div>

      {/* Voice tip */}
      <div className="bg-blue-950/50 border border-blue-800/40 rounded-lg p-3">
        <p className="text-xs text-blue-300 font-medium">🎤 Or speak when agent is connected</p>
        <p className="text-xs text-blue-400/70 mt-0.5 italic">"Watch for anyone using a mobile phone"</p>
      </div>

      {/* Input */}
      <div className="space-y-2">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addRule(input); }}}
          placeholder='e.g. "Watch for anyone using a mobile phone"'
          rows={3}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-red-500 transition-colors"
        />
        <button
          onClick={() => addRule(input)}
          disabled={!input.trim() || submitting}
          className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-xs font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {submitting
            ? <><div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"/>Sending to backend...</>
            : "➕ Add Monitoring Rule"
          }
        </button>

        {feedback && (
          <div className={`rounded-lg px-3 py-2 text-xs border ${
            feedback.type === "ok"   ? "bg-green-900/40 border-green-700 text-green-300" :
            feedback.type === "warn" ? "bg-yellow-900/40 border-yellow-700 text-yellow-300" :
                                       "bg-blue-900/40 border-blue-700 text-blue-300"
          }`}>
            {feedback.msg}
          </div>
        )}
      </div>

      {/* Examples */}
      <div>
        <p className="text-xs text-gray-600 uppercase tracking-wider mb-2">Quick examples</p>
        <div className="space-y-1">
          {EXAMPLES.map(ex => (
            <button key={ex} onClick={() => setInput(ex)}
              className="w-full text-left text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800 px-2 py-1.5 rounded transition-colors">
              + {ex}
            </button>
          ))}
        </div>
      </div>

      {/* Active rules with test button */}
      {rules.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Active Rules ({rules.length})</p>
          <div className="space-y-2">
            {rules.map(rule => (
              <div key={rule.id} className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${rule.confirmed ? "bg-green-400 animate-pulse" : "bg-yellow-500"}`} />
                  <div className="flex-1">
                    <p className="text-xs text-gray-200">{rule.text}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{rule.confirmed ? "✓ Active in backend" : "Sending..."} · Rule #{rule.id}</p>
                  </div>
                  <button onClick={() => setRules(prev => prev.filter(r => r.id !== rule.id))}
                    className="text-gray-700 hover:text-red-400 text-xs">✕</button>
                </div>

                {/* Two buttons: test simulation + show what YOLO watches */}
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => testRule(rule)}
                    disabled={testing === rule.id}
                    className="flex-1 py-1.5 rounded bg-yellow-800/40 hover:bg-yellow-700/60 border border-yellow-700/40 text-yellow-300 text-xs font-medium transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
                  >
                    {testing === rule.id
                      ? <><div className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin"/>Testing...</>
                      : "⚡ Simulate"
                    }
                  </button>
                  {testResult === rule.id && (
                    <span className="text-xs text-green-400 flex items-center">Alert fired →</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {rules.length === 0 && (
        <div className="text-center py-8 text-gray-700 text-xs">No rules yet — add one above</div>
      )}
    </div>
  );
}