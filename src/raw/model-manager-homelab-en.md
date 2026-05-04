---
title: Model Manager — How I Handle VRAM Contention When Too Many Agents Run at Once
date: 2026-05-04
tags: [homelab, ollama, api, queue, docker, python, open-source]
lang: en
---

In my homelab runs an Ollama server on `192.168.254.115` — 64 GB RAM, shared GPU, no cloud. On this machine scream 5 agents:

- TikTok Downloader (video transcription)
- Shortcutter (YouTube download + summary)
- n8n (AI workflows)
- Claude Skills (custom agents)
- embed-bookmarks.sh (note embedding)

Initially everyone did what they pleased: loaded a model when they needed it, unloaded when done. Simple.

Until it wasn't.

## The problem: the free-for-all

Without coordination, here's what happens.

Two agents request the model `whisper-large-v3` at the same time. Both see "not in VRAM" and load it. Result: 3 GB of VRAM wasted on a duplicate. Pointless.

TikTok Downloader finishes transcription and unloads the model (keep_alive=0). But right then shortcutter is running its second chunk on it. Silent crash.

Who is using what? Mystery. No visibility.

## The solution: per-model reservations

I built **Model Manager**, a REST API that acts like an intelligent traffic light.

When an agent needs a model, it doesn't load it directly. It **reserves** it:

```bash
curl -X POST http://192.168.254.115:5000/reservations \
  -d '{"model": "whisper-large-v3", "client": "tiktok-downloader", "timeout": 300}'
```

The response is one of these:
- `status: active` — the model is yours, it's in VRAM, go
- `status: queued` with `position: 2` — there's a line, wait

When you're done, you release it:

```bash
curl -X DELETE http://192.168.254.115:5000/reservations/{id}
```

And the next in queue gets activated automatically.

## How it works in practice

Client A reserves whisper → active (loads to VRAM).
Client B reserves the same model → queued, position 1.
Client C reserves the same model → queued, position 2.

A finishes, releases. The system activates B. B knows the model is ready, starts using it.
B finishes, releases. C gets activated.

No duplicates. No crashes. Queue respected.

For different models the system doesn't block: whisper and qwen3.5 can load simultaneously (separate locks, one per model). Not global, per-model.

## What I gained

**No crashes.** If an agent forgets to release? Auto-expire after 5 minutes (configurable). The model unloads and the next gets activated.

**Visibility.** I call:

```bash
curl http://192.168.254.115:5000/reservations/queue
```

And I see the entire queue, who has the lock, who's waiting, how long left.

**Stupid scalability.** Three more agents? Nothing changes. They just keep reserving.

**Reusability.** The same service is used by TikTok Downloader, Shortcutter, n8n, Claude Skills. Single source of truth.

## The repository and API

I released the code as open source: **https://github.com/lucasacchiricciardi/model-manager** (MIT license).

It includes:
- FastAPI REST service
- SQLAlchemy async with SQLite (or PostgreSQL, if you want to scale)
- Per-model reservation queue with auto-expire
- Swagger to test directly from the browser: **http://192.168.254.115:5000/docs**
- V1 backward-compatible endpoints (direct load/unload, if you want to skip the queue)
- Concurrent tests included

The API runs in Docker, obviously. Containerized, restartable, stateless, database persisted.

## The lesson

Asyncio.Lock doesn't exist only when you're scaling to millions of users.

It exists when you're the sole user but have 5 independent processes fighting over the same GPU.

"Look how clever I am" is not the point. The point is: code that reasons about "who gets the resource when" becomes way less fragile when coordination is **external** and **visible**.

Stack: FastAPI, SQLAlchemy async, SQLite, Docker, aiosqlite, httpx.

No cloud, no serverless, no recurring costs.

Worth it.
