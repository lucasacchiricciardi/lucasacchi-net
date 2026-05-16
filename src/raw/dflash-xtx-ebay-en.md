---
title: I bought an RX 7900 XTX on eBay to test DFlash. Result — 2.6x on Qwen3-8B
date: 2026-05-16
tags: [homelab, llm, llama.cpp, rocm, amd, speculative-decoding, benchmark, dflash]
lang: en
description: I tested DFlash speculative decoding (llama.cpp PR #22105) on an AMD RX 7900 XTX eGPU. Result: 2.62× on Qwen3-8B, 1.25× on gpt-oss-20b (MoE). Four honest stumbles on the way.
---

Last night I watched a seven-minute YouTube video: *"DFlash — 8x faster inference on llama.cpp."* The guy showcases a draft pull request on the `ggml-org/llama.cpp` repo with a speculative decoding method that — on paper — pushes a Qwen3-8B to 419 tokens per second on an NVIDIA L40S. Eight times the baseline. Paper numbers, not blog post numbers.

Instant curiosity. Not so much for the 8x — "up to" benchmarks are almost always up-to-never — but because the concept is elegant. And because for two weeks now there's been a card on my desk asking to be stress-tested.

## The card

An **RX 7900 XTX 24 GB GDDR6 Gigabyte Gaming OC**, bought on eBay at a used-but-not-too-used price. I connected it via OCUlink to the home-lab server `llm` — a Minisforum AI X1-255, AMD Ryzen 7 255, 64 GB DDR5 — replacing the integrated Radeon 780M iGPU that, until May 15, was the only GPU available to Ollama.

Moving the LLM workload from a laptop-class iGPU to a top-tier desktop card makes sense on its own. But until today I hadn't had a real reason to push the XTX. DFlash showed up at the right moment.

## What DFlash is, in thirty seconds

Speculative decoding is a trick worth knowing if you run local LLMs. The idea: instead of letting the big model autoregressively generate one token at a time, a small model (the *drafter*) proposes a whole block, the big model **verifies them in parallel**, accepts the correct ones and discards the rest. If the drafter guesses often, you go faster. If it misses too much, you end up slower than baseline.

DFlash is a recent variant — paper from z-lab, implemented in `llama.cpp` by [PR #22105](https://github.com/ggml-org/llama.cpp/pull/22105) from Ruixiang Wang. Key difference from EAGLE3 (the other speculative family): DFlash produces an entire block of candidates in a **single forward pass of the drafter**, not one token at a time. Higher draft throughput per iteration.

The official drafter for Qwen3-8B is a specialized 1B-parameter model, `z-lab/Qwen3-8B-DFlash-b16`, published as BF16 safetensors on Hugging Face.

In the paper, the acceptance rate on the "write quicksort in Python" prompt hits 93%. That's the number I wanted to see on my own machine.

## The technical part — four honest stumbles

The PR is still **draft** (last commit April 27). No guarantee the code builds cleanly. And of course.

I built a Docker container based on `rocm/dev-ubuntu-22.04`, cloned `llama.cpp`, checked out the PR, compiled with `-DGGML_HIP=ON -DAMDGPU_TARGETS=gfx1100` (the XTX architecture). Four real problems, in the order they hit:

**1. ROCm 6.2 isn't enough.** First build, error: `unknown type name '__hip_fp8_e4m3'`. The PR uses FP8 types introduced only in ROCm 6.3+. I jumped to 6.4.4. Build OK.

**2. Missing `ldconfig`.** `cmake --install` puts the shared libraries in `/usr/local/lib`, but the dynamic linker inside the container doesn't know they exist. `llama-server --version` fails with `libllama-common.so.0: cannot open shared object file`. I added one line to the Dockerfile:

```dockerfile
RUN echo /usr/local/lib > /etc/ld.so.conf.d/llama-cpp.conf && ldconfig
```

**3. `huggingface-cli` is dead.** At the model download step, the script errored out: *"huggingface-cli is deprecated and no longer works. Use `hf` instead."* From some recent release of the Hugging Face CLI, the binary has been renamed. Thirty years of Linux have taught me not to be surprised.

**4. The drafter needs the target.** The most subtle one. The PR's safetensors-to-GGUF conversion script adds a new required flag for DFlash drafters: `--target-model-dir`. It reads the `d2t`/`t2d` mapping tensors between the drafter's reduced vocabulary and the target's full vocabulary. Which means you can't use a pre-quantized GGUF from `unsloth/Qwen3-8B-GGUF` as the target source — you need the **full safetensors folder** of `Qwen/Qwen3-8B`, 16 GB, even if you'll throw it away right after that single conversion step. Same for the drafter: safetensors → GGUF bf16 → quantize Q4_K_M.

Final result, after intermediate cleanup:

```text
Qwen3-8B.gguf_Q4_K_M.gguf             4.7 GB   (target)
Qwen3-8B-DFlash-b16.gguf_Q4_K_M.gguf  596 MB   (drafter)
```

About 5.5 GB of VRAM occupied. Out of 24 GB on the XTX, leaving comfortable room for a q8_0 KV cache and even a couple of Ollama models in keep-alive.

## The moment of truth

Container started on port 8081. `llama-server` loads both models, declares `speculative decoding context initialized` and starts listening. First request — the paper's prompt, *"Write a quicksort algorithm in Python. Write code only."*

DFlash active:

```json
{
  "tokens_predicted": 92,
  "predicted_per_second": 132.7,
  "predicted_per_token_ms": 7.54,
  "draft_n": 80,
  "draft_n_accepted": 75
}
```

Acceptance rate: **75/80 = 93.75%**. Essentially identical to the paper (93.3%). Throughput: **132.7 tok/s**.

To have a fair point of comparison — because a single number means nothing — I reloaded the same model, same prompt, same sampling parameters, but without `--dflash` and without the drafter. Just Qwen3-8B Q4_K_M, plain autoregressive decoding on the XTX.

Baseline: **50.7 tok/s**.

Measured speedup: **132.7 / 50.7 = 2.62x**.

## What about the paper's 8x?

Fair question. Honest answer in three parts.

**The paper measures `bf16`, I measured `Q4_K_M`.** Apples and oranges. Quantizing the target to 4-bit raises the absolute baseline — fewer bytes to read from VRAM per forward pass — and therefore leaves less room for speculative decoding to make a difference. To give you the picture: my baseline (51 t/s on XTX Q4_K_M) almost exactly matches the paper's baseline (52 t/s on L40S bf16). Meaning the XTX in Q4 is working like an L40S in bf16. Very similar bandwidth balance, different card.

**The HIP/ROCm backend isn't as tuned as the CUDA one.** The PR is written CUDA-first, with `__hip_fp8_e4m3` remapped via a compatibility header. There's likely still margin on the ROCm kernel side — especially on drafter graph reuse, which the PR itself flags as *future work*.

**A single prompt has no warmup.** A single run includes compute graph cold start. A serious benchmark needs n=20 with variance, varied prompts (the PR uses three: quicksort, Pythagoras, "plan a 1-day trip to DC" — and shows that the acceptance rate drops from 93% to 9% on the third prompt, because DFlash works best when the drafter "guesses patterns," and generic prose is less predictable than code).

So: 2.6x isn't 8x, but it's 2.6x **real, repeatable, on my GPU, with my quantization, on my stack**. It's the number that matters when I'm deciding whether to put a local LLM pipeline into production.

## What I take home

**For the home lab**: for code-heavy workflows (the most common use case for my Shortcutter and the agents running on the knowledge base), DFlash on Qwen3-8B Q4_K_M gives a real 2.6x. That's the difference between responding in 700 ms and 1.8 s, on a 90-token generation. For an interactive assistant, it's the difference between "smooth" and "slow."

**For the XTX**: it behaves well. The RX 7900 XTX is a gaming card pushed into LLM inference duty, and in absolute numbers it holds up against pro NVIDIA cards in a higher price bracket. ROCm 6.4 on gfx1100 works without the `HSA_OVERRIDE_GFX_VERSION` workaround that was mandatory for RDNA3 Radeons just a year ago. Mature driver, native support, predictable performance.

**For the method**: go back to measuring instead of assuming. The YouTube video said 8x. My machine does 2.6x. Both numbers are true — in their respective contexts. Which one you use to decide depends on which context resembles yours more.

## Reproducibility

The full setup — Dockerfile with ROCm 6.4.4, docker-compose with `/dev/kfd` and `/dev/dri` mounts, model prep script, benchmark script — is public on GitHub: [**lucasacchiricciardi/llama-dflash-rocm**](https://github.com/lucasacchiricciardi/llama-dflash-rocm). Clone, `docker compose build`, `docker compose up`. If you reproduce it on another RDNA3 card (7800 XT, W7800, W7900), open an issue with your numbers — reproducibility is the point. Server launch command, for those who want to start from the native `llama-server` binary:

```bash
llama-server \
  -m  Qwen3-8B.gguf_Q4_K_M.gguf \
  -md Qwen3-8B-DFlash-b16.gguf_Q4_K_M.gguf \
  --host 0.0.0.0 --port 8081 \
  --cache-type-k q8_0 --cache-type-v q8_0 \
  --cache-type-k-draft q8_0 --cache-type-v-draft q8_0 \
  -ngl 99 --n-gpu-layers-draft 999 \
  --dflash --draft-max 6 \
  --temp 0 --top-k 1 \
  --parallel 1 --no-mmap --mlock --jinja \
  -c 4000 -cd 1000 -t 8 \
  --chat-template-kwargs '{"enable_thinking": false}'
```

The env var `LLAMA_SPEC_NO_THINK=1` disables Qwen3's *thinking* mode at the speculative layer — critical: with thinking on, acceptance rate collapses and the speedup roughly halves. The paper states it, I verified it.

## Bonus round: gpt-oss-20b

Couldn't resist. `openai/gpt-oss-20b` is the MoE model recently released by OpenAI on Hugging Face, with a dedicated drafter at `z-lab/gpt-oss-20b-DFlash`. Very different from Qwen3-8B: Mixture of Experts architecture, lower VRAM footprint relative to its nominal parameter count, distributed in **mxfp4** native format.

First discovery: llama.cpp blocks re-quantization from mxfp4:

```
requantizing from type mxfp4 is disabled
```

The target must be used as-is — a 13 GB GGUF in native mxfp4. The drafter quantizes to Q4_K_M normally. Second discovery: a PR bug. From the second request onward, `llama-server` crashes with `GGML_ASSERT(n_new >= 1) failed` in `speculative.cpp:781` — the code doesn't correctly reset cross-request speculative state when restoring the KV cache. Workaround: isolated container per prompt.

Results across three prompts (same benchmark as the original paper):

| Prompt | Baseline | DFlash | Speedup | Accept% |
|---|---|---|---|---|
| quicksort | 46 t/s | 77 t/s | 1.67× | 43.5% |
| pythagoras | 79 t/s† | 75 t/s | 0.95× | 26.6% |
| dc-trip | 45 t/s | 60 t/s | 1.33× | 18.5% |
| **average** | ~57 t/s | ~71 t/s | **1.25×** | — |

†The Pythagoras baseline at 79 t/s is anomalously high — the model likely varied its `reasoning_effort` between runs. Excluding it, average speedup is closer to 1.50×.

### Why less than Qwen3-8B?

MoE architecture. During DFlash's parallel verification pass, the target activates expert routing for each candidate token — overhead that a dense model doesn't have. Acceptance rate collapses (18–44% vs 93% for Qwen3-8B on the same prompt type), and speedup follows.

This isn't a DFlash failure. It's MoE physics: the bottleneck shifts from bandwidth to routing overhead, and parallel verification gains less ground.

### Direct comparison

| Model | Architecture | Format | Baseline | DFlash | Speedup |
|---|---|---|---|---|---|
| Qwen3-8B | Dense | Q4_K_M | 50.7 t/s | 132.7 t/s | **2.62×** |
| gpt-oss-20b | MoE | mxfp4 | ~57 t/s | ~71 t/s | **1.25×** |

For code-heavy workflows, Qwen3-8B with DFlash remains the right choice. gpt-oss-20b still makes sense as a production model — 20B MoE parameters in 13 GB VRAM is an excellent ratio — but it isn't the ideal candidate for speculative decoding.

---

*Updated 2026-05-16 with gpt-oss-20b results. Will update again when the PR is merged into master — currently draft. Next up: Qwen3.5-9B.*
