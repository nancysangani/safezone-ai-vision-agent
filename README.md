# 🛡 SafeZone AI
### Real-Time Workplace Safety Intelligence — Vision Possible Hackathon Entry

> *"What if every security camera could think, speak, and learn?"*

SafeZone AI is a multi-modal Vision Agent that watches live video feeds, listens to the environment, 
understands dangerous situations in context, and responds in real-time — all in under 500ms.

---

## 🎬 Demo

**Live demo:** https://safezone-demo.vercel.app 

---

## 🧠 What It Does

Unlike traditional security cameras that just record, SafeZone AI **understands**:

| Scenario | Camera sees | SafeZone AI understands |
|---|---|---|
| Person lies on floor | "Human detected" | "Person motionless for 12s — possible medical emergency" |
| Employee in server room | "Human detected" | "Unauthorized zone access — Restricted Area B" |
| 6 people crowd together | "Humans detected" | "Crowd density threshold exceeded — safety risk" |
| User types a rule | — | AI adds it to live monitoring pipeline instantly |

---

## ⚡ Architecture

```
Webcam / IP Camera
      │
      ▼
Stream Edge Network (WebRTC, <30ms latency)
      │
      ▼
┌──── SafetyProcessor (YOLO11 Dual-Model) ─────┐
│  • yolo11n-pose.pt  → Skeleton overlay       │
│  • yolo11n.pt       → Person detection logic │
│  • Temporal tracking → Fall detection        │
│  • Zone mapping     → Restricted area alerts │
└──────────────────────────────────────────────┘
      │
      ▼
Gemini Live (Realtime reasoning + voice output)
      │
      ├──→ ElevenLabs TTS → Voice alerts to room
      ├──→ Deepgram STT  → Listens to operator questions
      │
      ▼
Tool Calling → Claude (Incident Report Generation)
      │
      ▼
React Dashboard (Stream Video SDK + WebSocket events)
  • Live annotated video feed
  • Real-time alert timeline
  • Claude-generated incident reports
  • Teach Mode: natural language rule injection
```

---

## 🔥 Key Features

### 1. Dual-YOLO Pipeline (Smart Performance)
Two YOLO11 models run in parallel:
- **Pose model** at 10 FPS for rich skeleton overlays (visual wow)  
- **Detection model** at 5 FPS for logic + alerting (computational efficiency)

### 2. Temporal Reasoning (Not Just Detection)
Person stationary for 8+ seconds → "Person may be down" alert.  
Most systems just detect. We track state over time.

### 3. Teach Mode (True Agent Behaviour)
Tell the AI what to watch for in plain English — it updates live:
> *"Watch for anyone carrying boxes near the exit"*  
> ✅ Rule added. Monitoring activated.

### 4. Claude-Powered Incident Reports
One click → Claude generates a professional, timestamped incident report from the alert history.

### 5. Voice Alerts via Stream
The AI speaks alert summaries directly into the room via ElevenLabs TTS.  
CRITICAL events trigger immediate voice response.

---

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- Stream account (free) → https://getstream.io
- Gemini API key
- Anthropic API key (for incident reports)
- ElevenLabs API key (for voice alerts)

### Backend Setup (2 minutes)

```bash
cd backend

# Install uv (fast Python package manager)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install all dependencies
uv sync

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys

# Generate a frontend access token
uv run --env-file .env generate_token.py

# Pre-download YOLO models (optional but speeds up first run)
uv run python -c "from ultralytics import YOLO; YOLO('yolo11n.pt'); YOLO('yolo11n-pose.pt')"

# Start the agent
uv run --env-file .env python main.py --call-type default --call-id safezone-live-demo
```

### Frontend Setup (1 minute)

```bash
cd frontend

# Install dependencies
npm install

# Set up environment
cp .env.local.example .env.local
# Edit .env.local — paste your Stream API key + the token from generate_token.py

# Start dev server
npm run dev
# → Open http://localhost:3000
```

### Docker (One Command)

```bash
# From project root
cp backend/.env.example backend/.env
# Edit backend/.env

docker compose up --build
# → Dashboard at http://localhost:3000
```

---

## 🎬 Demo Script (For Judges)

1. **Open** the dashboard at http://localhost:3000
2. **Point** your webcam at yourself
3. **Zone test**: Move into the top-right corner → trigger restricted zone alert
4. **Fall detection**: Lie down or crouch still for 8+ seconds → CRITICAL alert fires
5. **Crowd**: Have 5+ people appear in frame → density alert
6. **Voice**: Listen — the AI agent speaks the alert aloud
7. **Teach Mode**: Type *"Watch for anyone near the door"* → confirm it's active
8. **Report**: Click "Generate Report" → Claude writes a professional incident report in real-time

---

## 📦 Project Structure

```
safezone-ai/
├── backend/
│   ├── main.py                     # Agent entry point (Vision Agents SDK)
│   ├── agents/
│   │   ├── safety_processor.py     # Dual-YOLO processor + temporal reasoning
│   │   └── incident_reporter.py    # Claude-powered tool functions
│   ├── knowledge/
│   │   └── safety_instructions.md  # Agent system context
│   ├── generate_token.py           # Dev utility: create Stream access token
│   ├── pyproject.toml              # Dependencies (uv)
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.tsx                 # Main dashboard (Stream Video SDK)
│   │   ├── hooks/
│   │   │   └── useSafetyEvents.ts  # Stream event subscription hook
│   │   ├── components/
│   │   │   ├── AlertTimeline.tsx   # Live alert feed
│   │   │   ├── LiveStatsBar.tsx    # Real-time metrics
│   │   │   ├── IncidentPanel.tsx   # Claude report generation
│   │   │   ├── TeachModePanel.tsx  # Natural language rule injection
│   │   │   └── StatusBadge.tsx     # Connection status
│   │   └── types/index.ts          # Shared TypeScript types
│   └── Dockerfile
└── docker-compose.yml              # One-command deployment
```

---

## 🛠 Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Video Transport | Stream Vision Agents SDK | <30ms latency, WebRTC edge network |
| Object Detection | YOLO11 (ultralytics) | Fast, accurate, runs at 10 FPS |
| Scene Reasoning | Gemini Live (Realtime) | Native video WebRTC, real-time response |
| Incident Reports | Claude claude-opus-4-6 | Best-in-class text generation |
| Voice Alerts | ElevenLabs TTS | Natural, professional voice quality |
| Speech Input | Deepgram STT | Fast, accurate transcription |
| Frontend | React + Stream Video SDK | Cross-platform, production-ready |
| Styling | Tailwind CSS | Rapid, polished UI |
| Deployment | Docker Compose | One-command production deploy |

---

## 🏆 Hackathon Criteria Mapping

| Criteria | How SafeZone Addresses It |
|---|---|
| **Potential Impact** | Workplace safety is a $50B global market. Every facility needs this. |
| **Creativity & Innovation** | Temporal reasoning + Teach Mode = no one else is doing this |
| **Technical Excellence** | Dual-YOLO pipeline, tool calling, multi-model orchestration, Docker deploy |
| **Real-Time Performance** | <30ms A/V latency via Stream Edge, <500ms alert-to-voice pipeline |
| **User Experience** | Clean dashboard, voice alerts, Teach Mode, one-click reports |
| **Best Use of Vision Agents** | YOLO processor + Gemini Live + Claude tools + React SDK — full stack |

---

## 🗺 Roadmap (Post-Hackathon)

- [ ] Custom PPE detection via Roboflow (hard hat, safety vest, gloves)
- [ ] Multi-camera correlation (alert when same person appears in 2 zones)
- [ ] Roboflow fire/smoke detection model integration  
- [ ] Mobile app (React Native via Stream SDK)
- [ ] Alert webhook integrations (Slack, PagerDuty, email)
- [ ] Historical analytics dashboard
- [ ] GDPR-compliant blurring of non-incident persons

---

## 📝 License

MIT — build on it, fork it, make it better.

---

*Built with ❤️ using Stream Vision Agents, YOLO11, Gemini Live, and Claude*
