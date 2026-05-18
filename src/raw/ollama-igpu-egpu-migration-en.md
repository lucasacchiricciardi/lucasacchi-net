---
title: Migrating Ollama from Radeon 780M to RX 7900 XTX — what to remove, what to add
date: 2026-05-14
tags: [ollama, rocm, amd, gpu, igpu, radeon-780m, radeon-7900xtx, ubuntu, llm, homelab, systemd]
lang: en
description: Swapping the card also means undoing the workarounds. The Ollama configuration that ran fine on the Radeon 780M (gfx1103) is full of env variables that on the 7900 XTX (native gfx1100) are either useless or actively harmful. What to drop, what to add, how to verify in the log.
---

**[← Read Part I: troubleshooting power management on the RX 7900 XTX](/blog/egpu-7900xtx-power-management-en/)**

---

In Part I I described how I added an RX 7900 XTX as an eGPU to the Minisforum AI X1 over OCuLink + DEG1, and how I worked through the card's power management until I confirmed it draws 0 actual watts at idle.

That piece was about energy. This one is about the **Ollama configuration**, because moving from an integrated iGPU to a discrete card isn't just "plug it in and go": the Ollama config that ran fine on the Radeon 780M (gfx1103) is full of workarounds that on the 7900 XTX (gfx1100) have to be removed, since they're not only useless but actively harmful.

This article documents the migration step by step: what to drop, what to add, why. With real test numbers.

## Starting state: Ollama running on the 780M

Before the 7900 XTX, the mini-PC did inference on the Radeon 780M alone (gfx1103), the iGPU built into my Ryzen 7 255 (Zen 4 Hawk Point). The 780M isn't officially supported by ROCm: the community gets it working by making it "pretend" to be a gfx1100 via an override variable.

This was my systemd `override.conf`:

```ini
# /etc/systemd/system/ollama.service.d/override.conf
[Service]
Environment="HSA_OVERRIDE_GFX_VERSION=11.0.0"
Environment="HSA_ENABLE_SDMA=0"
Environment="AMD_SERIALIZE_KERNEL=1"
Environment="OLLAMA_MAX_VRAM=49392123904"
Environment="OLLAMA_INTEL_GPU=0"
Environment="OLLAMA_HOST=0.0.0.0"
Environment="OLLAMA_MAX_LOADED_MODELS=6"
Environment="OLLAMA_NUM_PARALLEL=2"
Environment="OLLAMA_KV_CACHE_TYPE=q8_0"
```

This config is correct for a 780M, but it's also a compromise full of workarounds to make ROCm run on hardware it doesn't officially support. Each variable has a historical reason.

## The four "iGPU" variables to analyze

Before touching anything, understand what each variable does. Otherwise you're copy-pasting magic configs without learning anything. Double check before writing.

### `HSA_OVERRIDE_GFX_VERSION=11.0.0`

ROCm identifies AMD GPUs by their graphics architecture (gfx version). The HSA (Heterogeneous System Architecture) library loads kernels compiled for that specific architecture. The 780M is gfx1103, not supported by default. This variable tells ROCm to treat it as gfx1100 (a desktop RDNA 3 like the 7900 XTX/XT). gfx1100 kernels run on the 780M anyway because the ISA is compatible.

On the 7900 XTX this override is useless: it's natively gfx1100.

### `HSA_ENABLE_SDMA=0`

SDMA is the System DMA, AMD's hardware engine for DMA transfers between VRAM and system RAM without involving the CPU. On many APUs (Phoenix, Hawk Point) SDMA has known bugs that cause crashes or silent transfer errors. The solution is to disable it and use CPU-mediated copy paths instead.

On the 7900 XTX SDMA works perfectly, and it's actually essential for performance: disabling it forces slower transfers, hurting model loading and VRAM↔RAM transfers in particular (when a model doesn't fit entirely in VRAM).

### `AMD_SERIALIZE_KERNEL=1`

This variable forces ROCm to run one kernel at a time, serially, instead of allowing overlap. It's a stability workaround for APUs that have issues with the command processor under concurrent workloads. It heavily penalizes throughput.

On the 7900 XTX it's harmful: the Navi 31 command processor was designed precisely to handle concurrent kernels, and serializing them throws away up to 50% of theoretical performance on parallel workloads (typical of multi-stream inference).

### `OLLAMA_MAX_VRAM=49392123904`

That's 49 GB. The 780M has no dedicated VRAM: it uses system RAM (I'd reserved half of my 64 GB for inference). With this variable I told Ollama "assume you have 49 GB of GPU memory".

On the 7900 XTX VRAM is dedicated: exactly 24 GB. Leaving 49 GB lets Ollama attempt allocations that will fail, or spill into system RAM in unexpected ways. It needs to be brought back to the real value (with a small headroom for framebuffer/firmware/contexts). Side note: in recent Ollama versions (≥0.5.x) the variable isn't read anymore — the library queries the ROCm driver directly for available VRAM. So it's pointless either way: it does nothing, or if the older Ollama reads it, it gets a wrong value.

### The other variables (irrelevant)

- `OLLAMA_INTEL_GPU=0`: disables Intel ARC detection. On AMD it changes nothing, but skips a useless check.
- `OLLAMA_HOST=0.0.0.0`: bind on all network interfaces. Unrelated to the GPU.
- `OLLAMA_MAX_LOADED_MODELS=6`, `OLLAMA_NUM_PARALLEL=2`: concurrency limits. On the 7900 XTX they need to be recalibrated downward because the real VRAM is 24 GB, not 49 GB virtual.
- `OLLAMA_KV_CACHE_TYPE=q8_0`: 8-bit KV-cache quantization. Fine on the discrete card too: halves cache memory with negligible quality drop. I keep it.

## The migration promise

Clean summary of what changes:

| Variable | On 780M (gfx1103) | On 7900 XTX (gfx1100) |
|---|---|---|
| `HSA_OVERRIDE_GFX_VERSION=11.0.0` | Required for fake gfx1100 | Useless (native gfx1100) |
| `HSA_ENABLE_SDMA=0` | APU bug workaround | Harmful, remove |
| `AMD_SERIALIZE_KERNEL=1` | APU stability | Harmful, remove |
| `OLLAMA_MAX_VRAM=49 GB` | Shared virtual memory | Wrong, set to 22 GB real or remove |
| `OLLAMA_MAX_LOADED_MODELS=6` | OK with 49 GB | Set to 4 (more conservative) |
| `OLLAMA_KV_CACHE_TYPE=q8_0` | Memory saving | OK, keep |

Plus two important additions:

- `ROCR_VISIBLE_DEVICES=0` + `HIP_VISIBLE_DEVICES=0`: expose only the 7900 XTX to ROCm/HIP. The 780M stays invisible — no conflicts between native gfx1100 and gfx1100-via-override.
- `OLLAMA_FLASH_ATTENTION=1`: Flash Attention 2, lower memory and faster. Works very well on gfx1100. It was unstable on gfx1103, so I hadn't enabled it before.
- `OLLAMA_KEEP_ALIVE=5m`: after 5 minutes of idle, Ollama evicts models from VRAM. The kernel then puts the GPU in `suspended` (see Part I on runtime PM), and power drops back to 0 W. It's the "only on when needed" operational pattern.

## Preliminary diagnostics: identifying the GPU indices

Before writing `ROCR_VISIBLE_DEVICES`, we need to be sure which index corresponds to the 7900 XTX. Golden rule: don't assume. Enumeration depends on PCI ordering and can vary.

The canonical utility is `rocminfo`, but on my Ubuntu it wasn't installed (Ollama doesn't expose it in `PATH`, and the apt package is too old for the 7900 XTX). I used `rocm-smi` with VBIOS info, which is enough:

```bash
rocm-smi -v
```

Output:

```text
GPU[0]: VBIOS version: 113-3E4710U-O4W       ← 3E47 = Navi 31 (7900 XTX)
GPU[1]: VBIOS version: 113-PHXGENERIC-001    ← Phoenix iGPU (780M)
```

VBIOS strings reveal the hardware family: `3E47` is one of the device IDs in the Navi 31 family, `PHXGENERIC` is explicit. Conclusion: GPU[0] is the 7900 XTX, GPU[1] is the 780M.

`ROCR_VISIBLE_DEVICES=0` correctly points to the 7900 XTX.

## The new configuration

Backup first (safety first):

```bash
sudo cp /etc/systemd/system/ollama.service.d/override.conf \
        /etc/systemd/system/ollama.service.d/override.conf.bak-$(date +%Y%m%d-%H%M)
```

New file, written declaratively and commented:

```ini
# /etc/systemd/system/ollama.service.d/override.conf
[Service]

# === GPU selection ==========================================================
# Expose ONLY the 7900 XTX to ROCm (GPU[0], confirmed via rocm-smi VBIOS 3E47).
# The 780M iGPU (gfx1103) stays invisible to Ollama. No conflicts.
Environment="ROCR_VISIBLE_DEVICES=0"
Environment="HIP_VISIBLE_DEVICES=0"
Environment="OLLAMA_INTEL_GPU=0"

# === Memory =================================================================
# Keeping OLLAMA_MAX_VRAM only for back-compat with older Ollama versions.
# From v0.5+ it's ignored (Ollama reads it from the ROCm driver).
# 22 GB = 24 GB - ~2 GB headroom for framebuffer/firmware/contexts
# Environment="OLLAMA_MAX_VRAM=23622320128"

# 8-bit KV cache: halves cache memory, negligible degradation
Environment="OLLAMA_KV_CACHE_TYPE=q8_0"

# Flash Attention 2: less VRAM, more speed. Stable on gfx1100.
Environment="OLLAMA_FLASH_ATTENTION=1"

# === Concurrency ============================================================
Environment="OLLAMA_MAX_LOADED_MODELS=4"
Environment="OLLAMA_NUM_PARALLEL=2"

# After 5 min idle: evict models → GPU goes back to suspended → 0 W
Environment="OLLAMA_KEEP_ALIVE=5m"

# === Networking =============================================================
Environment="OLLAMA_HOST=0.0.0.0:11434"
```

What I **removed** vs the previous config:

- `HSA_OVERRIDE_GFX_VERSION=11.0.0`
- `HSA_ENABLE_SDMA=0`
- `AMD_SERIALIZE_KERNEL=1`
- `OLLAMA_MAX_VRAM=49392123904` (replaced by driver default)

What I **added**:

- `ROCR_VISIBLE_DEVICES=0` + `HIP_VISIBLE_DEVICES=0`
- `OLLAMA_FLASH_ATTENTION=1`
- `OLLAMA_KEEP_ALIVE=5m`

What I **kept**:

- `OLLAMA_KV_CACHE_TYPE=q8_0` (useful in both scenarios)
- `OLLAMA_HOST` (network, GPU-independent)
- `OLLAMA_INTEL_GPU=0` (harmless)

## Apply and verify in the log

```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
sudo systemctl status ollama --no-pager
```

The check that really matters is reading the startup log, where Ollama declares what it found:

```bash
sudo journalctl -u ollama --since "2 minutes ago" --no-pager -l \
  | grep -iE "inference compute|library=|gpu=|total=|gfx|rocm"
```

Key output:

```text
msg="inference compute" id=GPU-6bcf966248bfe03d
  library=ROCm
  compute=gfx1100
  name=ROCm0
  description="AMD Radeon RX 7900 XTX"
  driver=70253.21
  pci_id=0000:03:00.0
  type=discrete
  total="24.0 GiB"
  available="24.0 GiB"
```

Six checks:

| Check | Expected | Found | OK |
|---|---|---|---|
| Library | ROCm (not Vulkan, not CPU) | `library=ROCm` | ✅ |
| Architecture | gfx1100 (no override) | `compute=gfx1100` | ✅ |
| Single GPU | iGPU masked | one `ROCm0` only | ✅ |
| Device | 7900 XTX | `AMD Radeon RX 7900 XTX` | ✅ |
| Total VRAM | 24 GB | `total="24.0 GiB"` | ✅ |
| PCI ID | `0000:03:00.0` | OK | ✅ |

In the env map Ollama prints it matters that `HSA_OVERRIDE_GFX_VERSION` is now empty: that confirms it has been correctly dropped from the drop-in, and ROCm is using the card's native gfx1100 instead of a fake override.

## Functional test: the real numbers

The real proof the migration worked is the inference timings. Three scenarios.

### Scenario 1 — Cold start with download

```bash
time ollama run llama3.2:3b "Reply with a single word: OK"
# real    0m28.689s
```

The 28.7 seconds include the 2 GB model download from the internet. It isn't a latency benchmark, it's a benchmark of my connection + cold start. One-off.

### Scenario 2 — Hot run (model in VRAM, GPU active)

```bash
time ollama run llama3.2:3b "Reply with a single word: OK"
# real    0m0.145s
```

145 milliseconds. Of which 9 ms user and 18 ms sys. The rest is the localhost HTTP latency plus generating a single token. For someone coming from the 780M (where a single token on a 3B model took 800–1200 ms), that's a 6–8x latency improvement.

### Scenario 3 — Cold start without download (model on disk, GPU suspended)

This is the real operational case: after 5+ minutes of idle, Ollama has evicted the model from VRAM and the GPU has gone into `suspended`. On the next prompt:

- ~0.5–1 s: 7900 XTX wake-up from `suspended` → `active`
- ~1–2 s: model reload into VRAM
- <1 s: inference

Total 2–3 seconds. Acceptable for interactive use, ideal for batch workflows. Most importantly: after the first request, everything stays warm for 5 minutes, and within that window every call drops back to 145 ms.

## Operational lessons

### 1. iGPU configuration is hidden technical debt

When ROCm doesn't officially support your hardware, you accumulate cascading workarounds: `HSA_OVERRIDE` to force the gfx version, `HSA_ENABLE_SDMA` to avoid crashes, `AMD_SERIALIZE_KERNEL` for stability. Each one is a deliberate choice for that specific hardware, and each one becomes baggage when you move to supported hardware. When you upgrade the GPU, the first thing to do is review every env variable from scratch, not copy-paste the previous config.

### 2. GPU enumeration isn't obvious

The sysfs `cardN`, the `rocm-smi` output, the `ROCR_VISIBLE_DEVICES` enumeration, and the `HIP_VISIBLE_DEVICES` one can diverge. The safety rule:

1. Identify the GPU via `lspci` and PCI ID
2. Confirm the VBIOS via `rocm-smi -v` to make sure the ROCm index matches
3. Confirm with the Ollama startup log (`inference compute` tells you exactly what it found)

### 3. KEEP_ALIVE is the key to collaborative power management

Without `OLLAMA_KEEP_ALIVE`, Ollama keeps models in VRAM for a default of 5 minutes, but more importantly it keeps the GPU `active`. That prevents the kernel from putting the card into `suspended` via PCI runtime PM, and the 7900 XTX keeps drawing 10–30 "useless" W even with no requests. Setting `KEEP_ALIVE=5m` explicitly (or lower if you prefer) closes the loop:

```text
prompt → wake → load → infer
       → 5 min idle → unload → GPU suspended → 0 W
```

### 4. Always verify in the log, never assume

Every config change has to be validated by reading what Ollama actually understood. The env map in the startup log is the source of truth: if you see `HSA_OVERRIDE_GFX_VERSION:` empty and `compute=gfx1100`, the migration is correct. If you still see the old override or `compute=gfx1103`, you've forgotten a drop-in somewhere.

## Conclusion

Migrating Ollama from the Radeon 780M to the Radeon RX 7900 XTX doesn't mean "add the new GPU", it means carefully removing every workaround that existed to make ROCm run on unsupported hardware. The final configuration is shorter, more declarative, faster, and cooperates with kernel power management to draw zero watts in idle.

For anyone in a similar setup (mini-PC with an AMD APU + discrete AMD eGPU), the pattern is clear:

1. **Backup** the existing config
2. **Identify** the new GPU via PCI ID + VBIOS (`rocm-smi -v`)
3. **Remove** all iGPU overrides (`HSA_OVERRIDE`, `HSA_ENABLE_SDMA=0`, `AMD_SERIALIZE_KERNEL=1`)
4. **Expose** only the discrete card with `ROCR_VISIBLE_DEVICES`
5. **Recalibrate** VRAM and concurrency limits to match the new hardware
6. **Add** `OLLAMA_KEEP_ALIVE` to close the loop with power management
7. **Verify** in the log that Ollama sees exactly what you expect

And always, as I tell my students: safety first, little often, double check.
