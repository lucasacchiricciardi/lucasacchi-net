---
title: Da 87 watt a zero — troubleshooting del power management di una RX 7900 XTX eGPU
date: 2026-05-14
tags: [linux, ubuntu, amd, gpu, egpu, oculink, power-management, rocm, amdgpu, minisforum, homelab]
lang: it
description: rocm-smi diceva 87 W in idle. Il sysfs diceva 0 W. Lo strumento di misura sveglia la GPU. Ho rincorso il consumo vero attraverso quattro fonti indipendenti, e ho documentato il pattern di power management che funziona out-of-the-box su Linux.
---

Nel mio home lab ho aggiunto una Radeon RX 7900 XTX come eGPU al mini-PC Minisforum AI X1 (Ryzen 7 255 + Radeon 780M iGPU + 64 GB DDR5), usando l'adattatore Minisforum DEG1 via OCuLink. La macchina si chiama `llm` e fa quello che il nome suggerisce: serve modelli locali via Ollama.

Una volta che la scheda è installata e funzionante, mi pongo la domanda che ogni sysadmin homelabber si fa prima o poi davanti a una GPU da 355 W di TBP: quanto consuma quando non sta lavorando, e posso farla consumare meno?

Risposta breve: zero watt reali. Risposta lunga: questo articolo, perché ci sono arrivato passando per un falso allarme, un warning di firmware, e una correzione di stima sul display. Una piccola masterclass involontaria di misurazione e diagnostica Linux.

## L'hardware

| Componente | Modello |
|---|---|
| Mini-PC | Minisforum AI X1 |
| CPU | AMD Ryzen 7 255 (8C/16T, Zen 4 Hawk Point, 4 nm, TDP 45 W) |
| iGPU | AMD Radeon 780M (12 CU RDNA 3, gfx1103, boost 2600 MHz) |
| RAM | 64 GB DDR5 |
| Adattatore eGPU | Minisforum DEG1 (OCuLink → PCIe x4 Gen 4) |
| GPU esterna | AMD Radeon RX 7900 XTX (Navi 31, 24 GB GDDR6, TBP 355 W) |
| Cavo | OCuLink SFF-8611 |
| Alimentazione GPU | PSU ATX dedicato del DEG1 |
| OS | Ubuntu 24.04 LTS |
| Kernel | 6.8.0-111-generic |

Sul Ryzen 7 255: è il rebrand 2025 del Ryzen 7 8745H, sostanzialmente identico a parte un +50 MHz sul boost. Hawk Point Zen 4, 16 MB di L3, supporto AVX-512 nativo (utile come fallback CPU per inferenza LLM quando la eGPU è impegnata), DDR5 fino a 5600 MT/s, 20 lane PCIe Gen 4. Non ha l'NPU XDNA attivato, a differenza dei fratelli AI 9 HX 370 / 8945HS. Per un uso da homelab/LLM-host la mancanza dell'NPU è ininfluente: l'inferenza la fa la 7900 XTX, e quando serve calcolo CPU c'è AVX-512.

L'AI X1 espone una porta OCuLink che porta fuori 4 lane PCIe Gen 4 con un cavo standard, senza i compromessi del Thunderbolt. Il DEG1 è una dock semplice: scocca con slot PCIe x16, alimentazione ATX, cavo OCuLink di ingresso. Esattamente quello che vuoi quando la macchina principale è troppo piccola per ospitare la GPU ma può tirare fuori segnale PCIe.

Il collegamento fisico è banale: cavo OCuLink dal mini-PC al DEG1, ATX 24 pin sul DEG1, cavi PCIe 8+8 sulla 7900 XTX, accendi il DEG1 *prima* del PC. Il kernel `amdgpu` la riconosce automaticamente al boot.

## Verifica iniziale

Le verifiche di rito una volta avviato il sistema:

```bash
# La GPU è enumerata sul PCI bus?
lspci | grep -i amd
# 03:00.0 VGA compatible controller: AMD/ATI Navi 31 [Radeon RX 7900 XT/7900 XTX/7900M]
# c7:00.0 VGA compatible controller: AMD/ATI Phoenix3 (rev ba)

# Il driver amdgpu si è agganciato?
lsmod | grep amdgpu

# Quale cardN nel sysfs corrisponde alla 7900 XTX?
for c in /sys/class/drm/card[0-9]; do
  pci=$(basename $(readlink -f $c/device))
  name=$(lspci -s ${pci#0000:} | cut -d: -f3-)
  echo "$(basename $c) | $pci |$name"
done
```

Nel mio caso `card1` è la 7900 XTX (PCI `0000:03:00.0`), `card2` è la iGPU integrata del Ryzen. Attenzione: la numerazione `cardN` non coincide con la numerazione di `rocm-smi`. Identifica sempre il device giusto via PCI ID o `lspci`, mai per indice.

## La domanda da un milione di watt

Mi piacerebbe avere la macchina sempre accesa per Ollama, ma non posso permettermi (né tollerare) una 7900 XTX che consuma 100 W solo per stare lì in attesa. Quindi: la scheda va davvero in idle profondo quando non la uso?

Prima verifica con `rocm-smi`:

```text
GPU  Temp  AvgPwr   SCLK    MCLK     Fan    Perf  PwrCap   VRAM%  GPU%
0    27c   87.0W    259Mhz  456Mhz   14.9%  auto  303.0W   0%     6%
1    26c   5.035W   None    1000Mhz  0%     auto  Unsup.   1%     0%
```

87 watt in idle. Non un bel risultato. SCLK e MCLK sono bassi (259/456 MHz), ma il consumo medio rimane alto. Penso alla baseline idle nota della famiglia Navi 31 su Linux — un problema discusso su molte mailing list — e mi preparo a smanettare.

## Il sysfs come fonte di verità

Prima regola: non fidarti del primo strumento di misura. Controllo direttamente nel sysfs.

```bash
cat /sys/class/drm/card1/device/power_dpm_force_performance_level
# auto

# Connector status
for c in /sys/class/drm/card1-*/status; do
  echo "$c: $(cat $c)"
done
# Tutti disconnected: nessun monitor attaccato alla eGPU
```

`auto` significa che la Dynamic Power Management è libera di scalare. Nessun monitor sulla eGPU. Eppure il consumo resta alto.

Provo a vedere chi sta usando la scheda:

```bash
sudo fuser -v /dev/dri/card1 /dev/dri/renderD128
sudo lsof /dev/kfd
# Niente, nessuno.
```

`/dev/kfd` è il Kernel Fusion Driver di AMD, usato dai runtime ROCm/HIP per il compute. Vuoto. Nessun Ollama acceso, nessun processo GPU. Eppure `rocm-smi` dice 87 W.

C'è qualcosa che non torna.

## Il colpevole vero: gpu_busy_percent

Sample del carico GPU, due secondi alla volta:

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

Il primo sample è 81%, tutti gli altri 0%. È un classico polling artifact: la lettura stessa del sensore è ciò che attiva la GPU per un istante. La metrica `gpu_busy_percent` su RDNA3 è un counter del command processor che reagisce a qualunque accesso, incluso quello fatto per leggerlo.

Conclusione provvisoria: la GPU è realmente al 0% di carico. Ma allora cosa consuma 87 W?

## Il momento eureka: rocm-smi sveglia la GPU che vorrebbe dormire

Vado a guardare il PCI runtime power management:

```bash
cat /sys/bus/pci/devices/0000:03:00.0/power/control
# auto

cat /sys/bus/pci/devices/0000:03:00.0/power/runtime_status
# suspended

cat /sys/bus/pci/devices/0000:03:00.0/power/autosuspend_delay_ms
# 5000
```

La scheda è già in `suspended`. Runtime PM attivo di default sull'eGPU OCuLink, autosuspend dopo 5 secondi di inattività.

Per essere sicuro, monitoro lo stato in continuo senza accedere ai sensori GPU:

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
... (per 20 secondi)
```

Zero watt. Per venti secondi consecutivi. In `suspended`.

Quindi cosa stava succedendo prima? La risposta è semplice nella sua banalità: `rocm-smi` apre `/dev/dri/*` per leggere i sensori, e questo sveglia la GPU. Ogni volta che lo lanci, la scheda esce da `suspended` → `active`, viene letta nello stato "appena svegliata", e resta `active` per altri 5 secondi prima di tornare a dormire.

Lo strumento di misura era la causa del consumo misurato. Il classico osservatore che perturba il sistema osservato, qui in versione amministratore di sistema.

C'è anche una verifica fisica: quando la GPU è davvero `suspended`, il kernel restituisce un errore se provi a leggere `power1_average`:

```text
cat: /sys/class/drm/card1/device/hwmon/hwmon7/power1_average: Device or resource busy
```

Il sistema ti sta dicendo: "non posso leggerti il sensore perché la scheda è proprio spenta, e per leggerlo dovrei svegliarla — cosa che non vuoi". Il sensore inaccessibile *è* la prova del power saving.

## Il warning SMU che sembra brutto ma non lo è

Curiosando in `dmesg` trovo:

```text
amdgpu 0000:03:00.0: amdgpu: smu driver if version = 0x0000003d,
                              smu fw if version     = 0x00000040,
                              smu fw version        = 0x004e8200 (78.130.0)
amdgpu 0000:03:00.0: amdgpu: SMU driver if version not matched
```

Il System Management Unit firmware interface della GPU implementa la versione 64 (`0x40`), il driver kernel `amdgpu` di Ubuntu 6.8 supporta la 61 (`0x3d`). Mismatch di 3 release.

Importante: il firmware è *più nuovo* del driver, non viceversa. Aggiornare `linux-firmware` peggiorerebbe la divergenza. La soluzione corretta è un kernel più recente (HWE 6.11+ per Ubuntu 24.04), oppure semplicemente accettare il warning, che è cosmetico — il firmware mantiene retrocompatibilità con la IF version precedente.

Nel mio caso, dato che il runtime PM funziona già e la GPU va in deep sleep, il warning non sta limitando nulla di pratico. Lo segno nel runbook come "da rivedere al prossimo upgrade kernel".

## La iGPU e il monitor: una piccola correzione di stima

A questo punto la 7900 XTX è chiusa: zero watt confermati. Mi resta da capire se posso ottimizzare la iGPU del Ryzen, dato che la macchina la userò headless via SSH.

Verifico i connettori della iGPU (`card2`):

```bash
for c in /sys/class/drm/card2-*/status; do
  echo "$c: $(cat $c)"
done
# card2-HDMI-A-3: connected   ← c'è un monitor di servizio
```

C'era un monitor HDMI attaccato per la console di setup. Adesso che SSH funziona, lo posso staccare.

Lo stacco fisicamente, il kernel rileva HPD off, status passa a `disconnected`. Quanto risparmio? Ho ipotizzato 5–10 W di getto, poi ho dovuto correggermi.

Su un'APU come la Phoenix3, `pp_dpm_mclk` mostra il clock della RAM di sistema, non di una VRAM dedicata. La RAM continua a girare ai clock di lavoro perché la usa la CPU, non perché c'è un display attaccato. Staccare il monitor quindi:

- non fa scendere il memory clock (è driven dalla CPU, non dal display)
- spegne solo display PHY + display pipe HDMI
- risparmio reale: 1–3 W, non 5–10

Onestà intellettuale: stima precedente sbagliata, correzione applicata. Misurazione finale con `turbostat`:

```bash
sudo apt install linux-tools-$(uname -r) -y
sudo turbostat --num_iterations 3 --interval 2 --quiet
```

Output (estratto):

```text
PkgWatt  CorWatt  C3%     Busy%
3.06     0.10     98.61   0.43
3.52     0.30     96.51   0.78
```

Il package APU consuma 3.0–3.5 W in idle profondo, con i core CPU x86 a 0.1–0.3 W e tempo in C3 (deep idle) sopra il 96%.

Per metterla in prospettiva: il Ryzen 7 255 ha un TDP nominale di 45 W. Stare a 3 W in idle significa circa il 6.6% del TDP, senza aver toccato nessun parametro di tuning, governor o profilo di power. È il default di Ubuntu 24.04 con `amdgpu` su questa piattaforma — un esempio molto pulito di come la stack Linux moderna sa già scalare bene da sola su hardware AMD recente.

## Lo strumento giusto per misurare senza svegliare nulla

Lezione operativa: per monitorare il consumo della eGPU in modo affidabile, non usare `rocm-smi` in polling. Usa il sysfs e gestisci il caso "scheda sospesa":

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

`gpu-stat` legge solo `runtime_status` quando la GPU è sospesa, e accede ai sensori solo quando è attiva. Niente wake-up indotto.

Per Zabbix, lo stesso principio si traduce in tre UserParameter:

```ini
# /etc/zabbix/zabbix_agent2.d/gpu.conf
UserParameter=gpu.runtime_status,cat /sys/bus/pci/devices/0000:03:00.0/power/runtime_status
UserParameter=gpu.power_w,test "$(cat /sys/bus/pci/devices/0000:03:00.0/power/runtime_status)" = "suspended" && echo 0 || echo $(($(cat /sys/class/drm/card1/device/hwmon/hwmon*/power1_average)/1000000))
UserParameter=gpu.temp_c,test "$(cat /sys/bus/pci/devices/0000:03:00.0/power/runtime_status)" = "suspended" && echo 0 || echo $(($(cat /sys/class/drm/card1/device/hwmon/hwmon*/temp1_input)/1000))
```

Così il monitoring non sveglia mai la GPU, e in idle vedi correttamente `power=0` invece di errori o falsi positivi.

## Bilancio finale del consumo idle

| Componente | Idle |
|---|---|
| APU Phoenix (CPU + iGPU + SoC) | ~3.0 W |
| Radeon RX 7900 XTX (eGPU, suspended) | ~0 W |
| DDR5 + PHY | ~3–5 W |
| NVMe SSD | ~1–2 W |
| Scheda madre, VRM, ventole | ~5–10 W |
| Alimentatori (efficienza ~88%) | overhead +10–15% |
| **Stima alla presa** | **15–25 W** |

Per un sistema con una 7900 XTX collegata e pronta a inferire LLM al volo, idle alla presa sotto i 25 W è un ottimo risultato. La stessa scheda su Windows starebbe verosimilmente sui 35–45 W. La differenza è interamente merito del PCI runtime PM su Linux, più il fatto che la macchina è headless e la eGPU non ha display.

## Le tre regole di Sacchi, applicate qui

Questo case study è un manuale in miniatura delle tre regole che insegno ai miei studenti e che applico ai miei deployment.

**Safety first.** Prima di toccare qualunque parametro di power management, ho fatto solo letture in sysfs. Niente `echo` su file in `/sys` prima di aver capito cosa stavo modificando. Niente cambio di kernel finché ROCm non era confermato indipendente dal sistema. Niente disconnessione del cavo monitor finché non avevo verificato che SSH funzionasse.

**Little often.** Un passo alla volta, mai due modifiche insieme. Prima diagnosi via `rocm-smi`, poi sysfs, poi `fuser`/`lsof`, poi connector status, poi runtime PM, poi `turbostat`. Ogni passo ha cambiato la mia comprensione del sistema. Se avessi fatto tutto in blocco non avrei mai capito che `rocm-smi` era il problema.

**Double check.** L'87 W iniziale sembrava un problema reale. Solo controllando in tre modi indipendenti (carico GPU sample, runtime status, sensore in `suspended` non leggibile) ho confermato che era un artefatto di misura. E quando ho stimato 5–10 W di risparmio dal display ho dovuto correggere a 1–3 W dopo aver guardato meglio cosa fosse davvero `mclk` su un'APU.

## Prossimi passi

Cosa farò in futuro su questa macchina, in ordine di priorità:

1. Aggiornare il kernel a HWE 6.11+ quando avrò tempo di testare anche Ollama dopo l'upgrade. Risolverà il warning SMU IF e potenzialmente abbasserà la baseline idle della 7900 XTX *durante* l'inferenza.
2. Misurare il consumo a presa con uno Shelly Plug S già nella mia infra MQTT, per validare la stima 15–25 W.
3. Dashboard Zabbix dedicato a `llm`, con `runtime_status`, `PkgWatt`, temp e correlazione con i carichi Ollama.
4. Wake-on-LAN documentato per il pattern "spegni la macchina quando non serve, accendila on-demand quando un'API esterna deve fare inferenza".

## Conclusione

L'eGPU 7900 XTX su Minisforum AI X1 via OCuLink + DEG1 funziona molto bene su Ubuntu 24.04, e il PCI runtime power management del driver `amdgpu` è già attivo di default. Non servono tweak particolari, custom udev rules, o script di parking.

Il consumo idle reale è zero watt sulla eGPU, e circa 3 W sull'APU host. Sotto i 25 W stimati alla presa per l'intero sistema. Se hai una 7900 XTX in una eGPU enclosure e su `rocm-smi` vedi 80–90 W in idle, non stai vedendo il consumo reale: stai vedendo il consumo causato da `rocm-smi` stesso.

La lezione operativa più importante è quella della misurazione: lo strumento di osservazione cambia il sistema osservato, anche in informatica. Quando un valore non quadra, il primo sospetto deve essere il misuratore.

E poi, sempre: safety first, little often, double check.

---

Una volta verificato che la scheda dorme davvero, mi è rimasta una domanda parallela: la configurazione di Ollama che girava bene sulla 780M va bene anche sulla 7900 XTX? Spoiler: no, e i workaround vecchi diventano dannosi sulla nuova GPU.

**[Leggi la Parte II: migrare Ollama da iGPU 780M a eGPU 7900 XTX](/blog/ollama-igpu-egpu-migration/)**
