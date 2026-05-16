---
title: Whisper API — How I Reshaped the Architecture to Scale Transcription
date: 2026-05-04
tags: [architecture, microservices, whisper, api, python, open-source]
lang: en
---

A few days ago I shared Shortcutter, an open source tool that downloads YouTube videos, transcribes them, and produces structured summaries.

Today I rethought the architecture and decided to rebuild a piece that already looked solid.

## The problem: embedded model

Initially, Shortcutter carried `faster-whisper` embedded, the model loaded locally in memory.

For a 60-90 second video, that means 1.5 GB of VRAM occupied by a single component.

It works, sure. But it doesn't scale.

## The solution: extract the service

Instead of keeping the model inside the script, I extracted it: I created **Whisper API**, a REST service on a dedicated LAN server.

Shortcutter now calls `POST /transcribe` over HTTP.

Result: zero local VRAM, and the pattern becomes reusable.

## What changed in practice

Transcription no longer lives inside the script: it's a service of its own. If tomorrow I swap the transcriber (from Whisper to something else), I update the API and none of the clients notice.

On the model side, from remote I can use `large-v3-turbo` without paying the local VRAM cost. Change the `model=` parameter and done.

On reuse, TikTok Downloader, Shortcutter, and TwinScribeAI all talk to the same endpoint. Single source of truth, no duplicated transcription code spread across three projects.

And the boundary between "what my script does" and "what the service does" becomes obvious. Which, in the end, is the thing that saves you the most time.

## Not a refactor for show

This isn't a cosmetic refactor. It's a practical decision: separating concerns makes code more honest. Anyone working on AI pipelines knows that these small boundary shifts, "what lives where", change how you reason about problems.

## The repository

I published the code as open source: **https://github.com/lucasacchiricciardi/whisper-api** (MIT license)

It includes:
- FastAPI REST service for audio transcription
- Support for 6 Whisper models (tiny to large-v3-turbo)
- Docker containerization
- Lazy model loading with caching
- Health check + status endpoints
- Model lifecycle management (load/unload)

The service is already in production on 192.168.254.115:5001 in my homelab, used by TikTok Downloader and Shortcutter.

## The lesson

Scale isn't just "how many users to serve", it's also "how do I organize code so it grows without breaking".

This change didn't add a feature. It made the codebase more reasonable.

Worth it.
