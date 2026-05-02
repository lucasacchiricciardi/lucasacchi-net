---
title: Shortcutter — 5 lessons from a day of coding with local LLMs
date: 2026-05-02
tags: [ai, llm, whisper, self-hosted, python, open-source]
lang: en
---

I follow an Italian YouTube channel every day, ZioBudda Labs, that posts AI news as 2-minute shorts. Full of tools, repos, and models I want to try.

Problem: the links aren't there. Not in the video description, not in the channel bio. Only spoken, in the short. And when you watch 30 videos a month, you lose half the information.

So this morning I told myself: I'll build a pipeline that downloads them, analyzes them with local AI, and produces a daily digest via email. All self-hosted, zero external APIs, zero recurring costs.

I thought it would take half a workday. Tonight I have 3 Python scripts, 9 iterative versions, 4 critical bugs fixed, and one certainty: small models betray you in creative ways.

Here are 5 things I learned.

### 1. When a 4B parameter LLM can't find a GitHub repo in the description, it invents one

Always with `anthropics/` prepended. The fix: HEAD request. Does the repo exist? No? Drop the URL. Check first, trust after.

### 2. The LLM fixer that corrects 19 Whisper errors on a long transcript becomes worse than the raw under 1,500 characters

"Too much prompt for too little work." Lesson: skip it. If the text is too short for the model, the fix doesn't add value — it adds noise.

### 3. A 5-line sanity check saved the day

The LLM tried to replace the transcript with the video description. A "if the difference is above 30%, fall back to raw" blocked the disaster. Sounds trivial. It's gold.

### 4. Sometimes it's not the pipeline that's wrong: it's the creator who uploaded a video with mixed audio

Real case found today. The most honest thing my system does is say "I don't know" when the data is inconsistent.

### 5. The 3 rules I repeat to my students made more difference than any prompt or model

**Safety first** — sanity checks, validations, fallbacks.  
**Little often** — 9 small versions instead of a big-bang.  
**Double check** — a close look found a Python bug (variable shadowing) that reduced a 3,400-character transcript to 3. "ola". Three characters. Without noticing.

---

What I take home: when you build an LLM-based system, you can't hope the model behaves well. You have to assume it will make a mess and design the resilience around that.

The robust pipeline is the one that intercepts its own errors before your users see them.

Stack: Python, Whisper, Ollama (qwen 2.5 4B + llava 7B), n8n, all on AMD 780M iGPU with ROCm. No cloud, no APIs.
