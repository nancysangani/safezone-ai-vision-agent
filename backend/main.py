"""
SafeZone AI — main.py

Run locally:
    Terminal 1: uv run --env-file .env python teach_mode_api.py
    Terminal 2: uv run --env-file .env python main.py

Run via Docker:
    docker compose up --build
"""

import asyncio
import logging
import os
import sys

from dotenv import load_dotenv
from vision_agents.core import Agent, User
from vision_agents.core.agents.agent_launcher import AgentLauncher
from vision_agents.core.runner.runner import Runner
from vision_agents.plugins import getstream, gemini, elevenlabs, deepgram

from agents.safety_processor import SafetyProcessor
from agents.incident_reporter import register_incident_functions

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger("safezone")

CALL_TYPE = os.getenv("CALL_TYPE", "default")
CALL_ID   = os.getenv("CALL_ID",   "safezone-live-demo")

# In Docker: service name "teach-mode". Locally: "localhost"
TEACH_MODE_HOST = os.getenv("TEACH_MODE_HOST", "localhost")
TEACH_MODE_URL  = f"http://{TEACH_MODE_HOST}:8001/next-rule"


async def create_agent(**kwargs) -> Agent:
    safety_processor = SafetyProcessor(
        detection_fps=3,
        pose_fps=5,
        person_conf_threshold=0.55,
        object_conf_threshold=0.45,
        call_id=CALL_ID,
    )

    agent = Agent(
        edge=getstream.Edge(),
        agent_user=User(
            id="safezone-agent",
            name="SafeZone AI",
            image="https://ui-avatars.com/api/?name=SZ&background=ef4444&color=fff",
        ),
        instructions="""
You are SafeZone AI, a real-time workplace safety intelligence agent.
You continuously watch the video feed and listen for audio cues.

ALERT TRIGGERS:
- CRITICAL: Person down / not moving for 8+ seconds
- HIGH: Unauthorized access to restricted zone (blue overlay on video)
- HIGH: Person without required PPE
- MEDIUM: Unsafe behaviour — running, crowding

RESPONSE STYLE:
- Voice: Short, direct, calm. Max 2 sentences.
- Never use markdown in voice responses.
- TEACH MODE: If user says "Watch for [X]", confirm verbally: "Got it. Now monitoring for X."
""",
        llm=gemini.Realtime(fps=1),
        tts=elevenlabs.TTS(voice_id="pNInz6obpgDQGcFmaJgB"),
        stt=deepgram.STT(language="en-US"),
        processors=[safety_processor],
    )

    register_incident_functions(agent, safety_processor)
    return agent


async def _process_ui_rules(processor: SafetyProcessor, agent: Agent) -> None:
    """
    Polls teach_mode_api.py via HTTP every second for new rules.
    Works both locally and in Docker (no shared memory needed).
    """
    import aiohttp

    logger.info(f"🔌 Teach Mode polling: {TEACH_MODE_URL}")

    # Wait for teach_mode_api to be ready
    for attempt in range(10):
        try:
            async with aiohttp.ClientSession() as s:
                async with s.get(
                    f"http://{TEACH_MODE_HOST}:8001/health",
                    timeout=aiohttp.ClientTimeout(total=2)
                ) as r:
                    if r.status == 200:
                        logger.info("✅ Teach Mode API connected")
                        break
        except Exception:
            pass
        await asyncio.sleep(2)
    else:
        logger.warning("⚠️  Teach Mode API not reachable — UI teach mode disabled")
        return

    # Poll for rules
    while True:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    TEACH_MODE_URL,
                    timeout=aiohttp.ClientTimeout(total=2)
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        rule = data.get("rule")
                        if rule:
                            processor.add_custom_rule(rule)
                            watching = processor.get_stats_snapshot().get("watching_objects", [])
                            logger.info(f"📚 Teach Mode rule applied: '{rule}'")
                            logger.info(f"👁  Now watching: {watching}")
                            # Verbal confirmation via Gemini
                            try:
                                await agent.llm.simple_response(
                                    text=f"New rule added. Now monitoring for: {rule}."
                                )
                            except Exception as e:
                                logger.debug(f"Voice confirm error: {e}")
        except Exception:
            pass  # API temporarily unavailable, keep trying
        await asyncio.sleep(1)


async def join_call(agent: Agent, call_type: str, call_id: str, **kwargs) -> None:
    # Always use env vars — ignore random UUID the launcher generates
    call_type = CALL_TYPE
    call_id   = CALL_ID

    await agent.create_user()
    call = await agent.create_call(call_type, call_id)

    logger.info("🚀 SafeZone AI starting...")
    logger.info(f"📡 Joining call: {call_type}/{call_id}")

    # Get processor reference
    processor = None
    candidates = getattr(agent, "_processors", None) or getattr(agent, "processors", [])
    for p in candidates:
        if hasattr(p, "add_custom_rule"):
            processor = p
            break

    async with agent.join(call):
        logger.info("✅ Agent live — monitoring active")

        # Start teach mode HTTP poller as background task
        poll_task = None
        if processor:
            poll_task = asyncio.create_task(_process_ui_rules(processor, agent))

        await asyncio.sleep(2)
        try:
            await agent.llm.simple_response(
                text="SafeZone AI is now online and monitoring the feed. All systems operational."
            )
        except Exception as e:
            logger.warning(f"Startup voice error: {e}")

        logger.info("🧠 Monitoring active. Press Ctrl+C to stop.")

        try:
            await agent.finish()
        finally:
            if poll_task:
                poll_task.cancel()


if __name__ == "__main__":
    launcher = AgentLauncher(create_agent=create_agent, join_call=join_call)
    runner   = Runner(launcher)
    runner.run()