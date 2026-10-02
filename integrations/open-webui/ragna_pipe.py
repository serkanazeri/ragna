"""
title: RAGNA Evidence Workbench
author: Serkan Azeri
version: 0.1.0
license: MIT
description: Calls the RAGNA API and emits its authorized citations and response mode.
"""
import asyncio
import os
import requests
from pydantic import BaseModel, Field


class Pipe:
    class Valves(BaseModel):
        RAGNA_BASE_URL: str = Field(default=os.getenv("RAGNA_BASE_URL", "http://host.docker.internal:8787"))
        RAGNA_API_KEY: str = Field(default=os.getenv("RAGNA_API_KEY", ""))

    def __init__(self):
        self.valves = self.Valves()

    def pipes(self):
        return [{"id": "ragna", "name": "RAGNA · Evidence Workbench"}]

    async def pipe(self, body: dict, __event_emitter__=None, __user__=None, __task__=None):
        if __task__:
            return "RAGNA evidence conversation"
        question = next((m.get("content", "") for m in reversed(body.get("messages", [])) if m.get("role") == "user"), "")
        if not isinstance(question, str) or not 3 <= len(question.strip()) <= 1500:
            return "Please ask a text question between 3 and 1500 characters."
        if not self.valves.RAGNA_API_KEY:
            return "An administrator must configure the RAGNA API key."
        if __event_emitter__:
            await __event_emitter__({"type": "status", "data": {"description": "Retrieving authorized evidence…", "done": False}})
        try:
            # Public corpus only: an Open WebUI role is not an operations-data grant.
            response = await asyncio.to_thread(requests.post, self.valves.RAGNA_BASE_URL.rstrip("/") + "/api/chat", headers={"Authorization": "Bearer " + self.valves.RAGNA_API_KEY}, json={"question": question, "audience": "public"}, timeout=90)
            response.raise_for_status()
            result = response.json()
            if __event_emitter__:
                for source in result["citations"]:
                    await __event_emitter__({"type": "citation", "data": {"document": [source["excerpt"]], "metadata": [{"source": source["title"], "version": source["version"]}], "source": {"name": f'{source["id"]} · {source["title"]}'}}})
                await __event_emitter__({"type": "status", "data": {"description": f'{result["mode"]} · {result["provider"]} · {result["durationMs"] / 1000:.2f}s', "done": True}})
            return f'**{result["mode"].upper()}** · {result["provider"]}\n\n{result["answer"]}'
        except (requests.RequestException, ValueError, KeyError):
            if __event_emitter__:
                await __event_emitter__({"type": "status", "data": {"description": "RAGNA unavailable", "done": True}})
            return "RAGNA could not complete this request. Check the API connection and try again."
