# -*- coding: utf-8 -*-
"""
teach_mode_api.py

FastAPI server for receiving teach mode rules from the React frontend.
Works both locally and in Docker (backend polls via HTTP).

Endpoints:
  POST /teach       — add a rule (from React UI)
  GET  /next-rule   — get next queued rule (polled by main.py)
  GET  /health      — health check
"""

import asyncio
import logging
import sys
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("safezone.api")

_rule_queue: asyncio.Queue = asyncio.Queue()


class TeachRuleRequest(BaseModel):
    rule: str


class TeachRuleResponse(BaseModel):
    status:  str
    rule:    str
    message: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("✅ Teach Mode API started on http://0.0.0.0:8001")
    yield
    logger.info("Teach Mode API stopped")


app = FastAPI(title="SafeZone Teach Mode API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "pending_rules": _rule_queue.qsize()}


@app.post("/teach", response_model=TeachRuleResponse)
async def add_teach_rule(request: TeachRuleRequest):
    rule = request.rule.strip()
    if not rule:
        return TeachRuleResponse(status="error", rule=rule, message="Rule cannot be empty")
    await _rule_queue.put(rule)
    logger.info(f"Rule queued: '{rule}'")
    return TeachRuleResponse(status="ok", rule=rule, message=f"Rule queued: {rule}")


@app.get("/next-rule")
async def next_rule():
    """
    Returns the next queued rule (non-blocking).
    Returns {"rule": null} if queue is empty.
    Polled by main.py every second.
    """
    try:
        rule = _rule_queue.get_nowait()
        logger.info(f"Rule dispatched to backend: '{rule}'")
        return {"rule": rule}
    except asyncio.QueueEmpty:
        return {"rule": None}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)