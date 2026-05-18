---
title: From 87 watts to zero — troubleshooting power management of an RX 7900 XTX eGPU
date: 2026-05-14
tags: [linux, ubuntu, amd, gpu, egpu, oculink, power-management, rocm, amdgpu, minisforum, homelab]
lang: en
description: rocm-smi reported 87 W idle. sysfs reported 0 W. The measurement tool was waking the GPU up. I chased the real consumption through four independent sources and documented the power-management pattern that works out of the box on Linux.
---

In my home lab I added a Radeon RX 7900 XTX as an eGPU to a Minisforum AI X1 mini-PC (Ryzen 7 255 + Radeon 780M iGPU + 64 GB DDR5), using the Minisforum DEG1 adapter over OCuLink. The machine is called `llm` and it does what the name suggests: serves local models via Ollama.

Once the card was installed and working, I asked the question every home-lab sysadmin asks sooner or later in front of a 355 W TBP card: how much does it draw when it isn't working, and can I get that down?

Short answer: zero actual watts. Long answer: this article, because I got there via a false alarm, a firmware warning, and a correction on display power savings. A small unintended masterclass in Linux measurement and diagnostics.

## The hardware

| Component | Model |
|---|---|
| Mini-PC | Minisforum AI X1 |
| CPU | AMD Ryzen 7 255 (8C/16T, Zen 4 Hawk Point, 4 nm, TDP 45 W) |
| iGPU | AMD Radeon 780M (12 CU RDNA 3, gfx1103, 2600 MHz boost) |
| RAM | 64 GB DDR5 |
| eGPU adapter | Minisforum DEG1 (OCuLink → PCIe x4 Gen 4) |
| External GPU | AMD Radeon RX 7900 XTX (Navi 31, 24 GB GDDR6, TBP 355 W) |
| Cable | OCuLink SFF-8611 |
| GPU power | Dedicated ATX PSU in the DEG1 |
| OS | Ubuntu 24.04 LTS |
| Kernel | 6.8.0-111-generic |

On the Ryzen 7 255: it's the 2025 rebrand of the Ryzen 7 8745H, essentially identical aside from a +50 MHz boost bump. Hawk Point Zen 4, 16 MB L3, native AVX-512 (useful as a CPU fallback for LLM inference when the eGPU is busy), DDR5 up to 5600 MT/s, 20 PCIe Gen 4 lanes. No active XDNA NPU, unlike its AI 9 HX 370 / 8945HS siblings. For a homelab/LLM-host the missing NPU is irrelevant: inference runs on the 7900 XTX, and when CPU compute is needed AVX-512 covers it.

The AI X1 exposes an OCuLink port that brings out 4 PCIe Gen 4 lanes over a standard cable, without the Thunderbolt compromises. The DEG1 is a simple dock: a chassis with a PCIe x16 slot, ATX power, and an OCuLink input cable. Exactly what you want when the main machine is too small to host the GPU but can push PCIe signal outside the chassis.

Physical hookup is trivial: OCuLink cable from the mini-PC to the DEG1, 24-pin ATX on the DEG1, 8+8 PCIe cables to the 7900 XTX, power on the DEG1 *before* the PC. The `amdgpu` kernel driver picks it up at boot.

## Initial verification

Standard checks once the system is up:

```bash
# Is the GPU enumerated on the PCI bus?
lspci | grep -i amd
# 03:00.0 VGA compatible controller: AMD/ATI Navi 31 [Radeon RX 7900 XT/7900 XTX/7900M]
# c7:00.0 VGA compatible controller: AMD/ATI Phoenix3 (rev ba)

# Has the amdgpu driver attached?
lsmod | grep amdgpu

# Which cardN in sysfs corresponds to the 7900 XTX?
for c in /sys/class/drm/card[0-9]; do
  pci=$(basename $(readlink -f $c/device))
  name=$(lspci -s ${pci#0000:} | cut -d: -f3-)
  echo "$(basename $c) | $pci |$name"
done
```

In my case `card1` is the 7900 XTX (PCI `0000:03:00.0`), `card2` is the integrated iGPU. Heads up: the `cardN` numbering doesn't line up with the `rocm-smi` numbering. Always identify the right device by PCI ID or `lspci`, never by index.

## The million-watt question

I'd like to keep the machine on full-time for Ollama, but I can't afford (or stomach) a 7900 XTX that pulls 100 W just sitting idle. So: does the card actually go into deep idle when I'm not using it?

First check with `rocm-smi`:

```text
GPU  Temp  AvgPwr   SCLK    MCLK     Fan    Perf  PwrCap   VRAM%  GPU%
0    27c   87.0W    259Mhz  456Mhz   14.9%  auto  303.0W   0%     6%
1    26c   5.035W   None    1000Mhz  0%     auto  Unsup.   1%     0%
```

87 watts idle. Not great. SCLK and MCLK are low (259/456 MHz), but the average power stays high. I start thinking about the well-known Navi 31 idle baseline on Linux — a topic discussed on many mailing lists — and get ready to dig.

## sysfs as the source of truth

First rule: don't trust the first measurement tool. I go straight to sysfs.

```bash
cat /sys/class/drm/card1/device/power_dpm_force_performance_level
# auto

# Connector status
for c in /sys/class/drm/card1-*/status; do
  echo "$c: $(cat $c)"
done
# All disconnected: no monitor attached to the eGPU
```

`auto` means Dynamic Power Management is free to scale. No monitor on the eGPU. And yet power stays high.

I try to see who's using the card:

```bash
sudo fuser -v /dev/dri/card1 /dev/dri/renderD128
sudo lsof /dev/kfd
# Nothing, no one.
```

`/dev/kfd` is AMD's Kernel Fusion Driver, used by the ROCm/HIP runtimes for compute. Empty. No Ollama running, no GPU process. Yet `rocm-smi` says 87 W.

Something doesn't add up.

## The real culprit: gpu_busy_percent

GPU load sampling, every two seconds:

```text
81
0
0
0
0
0
0
0
0
0
```

The first sample is 81%, the rest are 0%. That's a classic polling artifact: the very act of reading the sensor wakes the GPU for an instant. The `gpu_busy_percent` metric on RDNA3 is a command-processor counter that reacts to any access, including the one made to read it.

Provisional conclusion: the GPU is genuinely at 0% load. So what's drawing 87 W?

## The eureka moment: rocm-smi wakes up a GPU that wants to sleep

I check PCI runtime power management:

```bash
cat /sys/bus/pci/devices/0000:03:00.0/power/control
# auto

cat /sys/bus/pci/devices/0000:03:00.0/power/runtime_status
# suspended

cat /sys/bus/pci/devices/0000:03:00.0/power/autosuspend_delay_ms
# 5000
```

The card is already `suspended`. Runtime PM is active by default on the OCuLink eGPU, autosuspend after 5 seconds of inactivity.

To be sure, I monitor the state continuously without touching the GPU sensors:

```bash
for i in $(seq 1 10); do
  status=$(cat /sys/bus/pci/devices/0000:03:00.0/power/runtime_status)
  pwr=$(cat /sys/class/drm/card1/device/hwmon/hwmon*/power1_average 2>/dev/null)
  echo "$(date +%T) status=$status power=$((pwr/1000000))W"
  sleep 2
done
```

Output:

```text
17:06:54 status=suspended power=0W
17:06:56 status=suspended power=0W
17:06:58 status=suspended power=0W
... (for 20 seconds)
```

Zero watts. Twenty seconds in a row. Suspended.

So what was happening before? The answer is simple in its banality: `rocm-smi` opens `/dev/dri/*` to read the sensors, and that wakes the GPU. Every time you run it the card goes from `suspended` → `active`, is sampled in its "just woke up" state, and stays `active` for another 5 seconds before going back to sleep.

The measurement tool was the cause of the measured consumption. The classic observer perturbing the observed system, in sysadmin form.

There's also physical confirmation: when the GPU is genuinely `suspended`, the kernel returns an error if you try to read `power1_average`:

```text
cat: /sys/class/drm/card1/device/hwmon/hwmon7/power1_average: Device or resource busy
```

The system is telling you: "I can't read the sensor because the card is actually off, and to read it I'd have to wake it up — which you don't want". The unreachable sensor *is* the proof of power saving.

## The SMU warning that looks scary but isn't

Browsing through `dmesg` I find:

```text
amdgpu 0000:03:00.0: amdgpu: smu driver if version = 0x0000003d,
                              smu fw if version     = 0x00000040,
                              smu fw version        = 0x004e8200 (78.130.0)
amdgpu 0000:03:00.0: amdgpu: SMU driver if version not matched
```

The GPU's System Management Unit firmware implements interface version 64 (`0x40`), while the Ubuntu 6.8 `amdgpu` kernel driver supports 61 (`0x3d`). A 3-release mismatch.

Important: the firmware is *newer* than the driver, not the other way round. Updating `linux-firmware` would make the divergence worse. The right fix is a newer kernel (HWE 6.11+ on Ubuntu 24.04), or just accepting the warning, which is cosmetic — the firmware keeps backward compatibility with the previous IF version.

In my case, since runtime PM works already and the GPU goes to deep sleep, the warning isn't constraining anything in practice. I log it in the runbook as "revisit at the next kernel upgrade".

## The iGPU and the monitor: a small estimate correction

At this point the 7900 XTX case is closed: zero watts confirmed. I still want to see whether I can optimize the Ryzen's iGPU, since the machine will run headless over SSH.

I check the iGPU connectors (`card2`):

```bash
for c in /sys/class/drm/card2-*/status; do
  echo "$c: $(cat $c)"
done
# card2-HDMI-A-3: connected   ← service monitor
```

There was an HDMI monitor attached for the setup console. Now that SSH works I can unplug it.

I unplug it, the kernel detects HPD off, status flips to `disconnected`. How much do I save? I had guessed 5–10 W, then I had to correct myself.

On an APU like Phoenix3, `pp_dpm_mclk` shows the system RAM clock, not a dedicated VRAM clock. The RAM keeps running at working frequencies because the CPU uses it, not because there's a display attached. So unplugging the monitor:

- doesn't lower the memory clock (it's driven by the CPU, not the display)
- only powers down the display PHY + the HDMI display pipe
- actual saving: 1–3 W, not 5–10

Intellectual honesty: previous estimate was wrong, correction applied. Final measurement with `turbostat`:

```bash
sudo apt install linux-tools-$(uname -r) -y
sudo turbostat --num_iterations 3 --interval 2 --quiet
```

Output (excerpt):

```text
PkgWatt  CorWatt  C3%     Busy%
3.06     0.10     98.61   0.43
3.52     0.30     96.51   0.78
```

The APU package draws 3.0–3.5 W in deep idle, with x86 cores at 0.1–0.3 W and time in C3 (deep idle) above 96%.

For perspective: the Ryzen 7 255 has a 45 W nominal TDP. Sitting at 3 W idle means about 6.6% of TDP, without touching any tuning parameter, governor, or power profile. It's the default Ubuntu 24.04 + `amdgpu` on this platform — a very clean example of how the modern Linux stack already scales well on recent AMD hardware.

## The right tool to measure without waking anything

Operational lesson: to monitor eGPU power reliably, don't use `rocm-smi` in polling. Use sysfs and handle the "card suspended" case:

```bash
sudo tee /usr/local/bin/gpu-stat <<'EOF'
#!/usr/bin/env bash
PCI="0000:03:00.0"
CARD="card1"

status=$(cat /sys/bus/pci/devices/$PCI/power/runtime_status)
echo "Status:  $status"

if [ "$status" = "suspended" ]; then
  echo "Power:   ~0 W (GPU in deep sleep)"
  echo "Note:    sensors inaccessible while suspended"
  exit 0
fi

power_uw=$(cat /sys/class/drm/$CARD/device/hwmon/hwmon*/power1_average 2>/dev/null)
temp_mc=$(cat /sys/class/drm/$CARD/device/hwmon/hwmon*/temp1_input 2>/dev/null)
busy=$(cat /sys/class/drm/$CARD/device/gpu_busy_percent 2>/dev/null)
sclk=$(grep '\*' /sys/class/drm/$CARD/device/pp_dpm_sclk 2>/dev/null | tr -d ' ')
mclk=$(grep '\*' /sys/class/drm/$CARD/device/pp_dpm_mclk 2>/dev/null | tr -d ' ')

echo "Power:   $((${power_uw:-0}/1000000)) W"
echo "Temp:    $((${temp_mc:-0}/1000)) °C"
echo "Busy:    ${busy:-N/A}%"
echo "SCLK:    ${sclk:-N/A}"
echo "MCLK:    ${mclk:-N/A}"
EOF
sudo chmod +x /usr/local/bin/gpu-stat
```

`gpu-stat` only reads `runtime_status` when the GPU is suspended, and only touches sensors when it's active. No induced wake-up.

For Zabbix, the same principle becomes three UserParameters:

```ini
# /etc/zabbix/zabbix_agent2.d/gpu.conf
UserParameter=gpu.runtime_status,cat /sys/bus/pci/devices/0000:03:00.0/power/runtime_status
UserParameter=gpu.power_w,test "$(cat /sys/bus/pci/devices/0000:03:00.0/power/runtime_status)" = "suspended" && echo 0 || echo $(($(cat /sys/class/drm/card1/device/hwmon/hwmon*/power1_average)/1000000))
UserParameter=gpu.temp_c,test "$(cat /sys/bus/pci/devices/0000:03:00.0/power/runtime_status)" = "suspended" && echo 0 || echo $(($(cat /sys/class/drm/card1/device/hwmon/hwmon*/temp1_input)/1000))
```

Monitoring never wakes the GPU, and idle reads correctly as `power=0` instead of errors or false positives.

## Final idle power budget

| Component | Idle |
|---|---|
| APU Phoenix (CPU + iGPU + SoC) | ~3.0 W |
| Radeon RX 7900 XTX (eGPU, suspended) | ~0 W |
| DDR5 + PHY | ~3–5 W |
| NVMe SSD | ~1–2 W |
| Motherboard, VRM, fans | ~5–10 W |
| PSUs (~88% efficiency) | overhead +10–15% |
| **Wall-plug estimate** | **15–25 W** |

For a system with a 7900 XTX attached and ready to infer LLMs on demand, sub-25 W at the wall plug is a great result. The same card on Windows would likely sit at 35–45 W. The difference is entirely thanks to PCI runtime PM on Linux, plus the fact that the machine is headless and the eGPU has no display attached.

## The three Sacchi rules, applied here

This case study is a miniature manual of the three rules I teach my students and apply to my deployments.

**Safety first.** Before touching any power-management parameter, I only did sysfs reads. No `echo` into `/sys` files before understanding what I was modifying. No kernel switch until ROCm was confirmed independent from it. No unplugging the monitor cable until I had verified SSH was working.

**Little often.** One step at a time, never two changes together. First `rocm-smi`, then sysfs, then `fuser`/`lsof`, then connector status, then runtime PM, then `turbostat`. Each step changed my understanding of the system. If I'd done it all at once I'd never have figured out that `rocm-smi` was the problem.

**Double check.** The initial 87 W looked like a real problem. Only by cross-checking three independent ways (GPU load samples, runtime status, sensor unreadable while suspended) could I confirm it was a measurement artefact. And when I estimated 5–10 W from unplugging the display, I had to correct to 1–3 W after looking more carefully at what `mclk` actually meant on an APU.

## Next steps

What I'll do next on this machine, in priority order:

1. Upgrade the kernel to HWE 6.11+ when I have time to retest Ollama as well. It'll resolve the SMU IF warning and potentially lower the 7900 XTX idle baseline *during* inference too.
2. Measure wall-plug consumption with a Shelly Plug S already in my MQTT infrastructure, to validate the 15–25 W estimate.
3. A dedicated Zabbix dashboard for `llm` with `runtime_status`, `PkgWatt`, temp, and correlation with Ollama load.
4. Wake-on-LAN documented for the "power off when unused, wake on demand when an external API needs to infer" pattern.

## Conclusion

The 7900 XTX eGPU on Minisforum AI X1 over OCuLink + DEG1 runs very well on Ubuntu 24.04, and the `amdgpu` PCI runtime power management is already active by default. No custom tweaks, udev rules, or parking scripts needed.

Actual idle power is zero watts on the eGPU, and around 3 W on the host APU. Below the 25 W wall-plug estimate for the whole system. If you have a 7900 XTX in an eGPU enclosure and `rocm-smi` shows 80–90 W idle, you're not seeing the real power draw — you're seeing the draw caused by `rocm-smi` itself.

The most important operational takeaway is about measurement: the observing tool changes the observed system, in computing too. When a number doesn't look right, the first suspect should be the measurement.

And always: safety first, little often, double check.

---

Once I confirmed the card actually sleeps, I still had a parallel question: does the Ollama configuration that ran fine on the 780M still make sense on the 7900 XTX? Spoiler: it doesn't, and the old workarounds become harmful on the new GPU.

**[Read Part II: migrating Ollama from iGPU 780M to eGPU 7900 XTX](/blog/ollama-igpu-egpu-migration-en/)**
