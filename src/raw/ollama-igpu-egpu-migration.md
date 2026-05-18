---
title: Migrare Ollama da Radeon 780M a RX 7900 XTX — cosa rimuovere, cosa aggiungere
date: 2026-05-14
tags: [ollama, rocm, amd, gpu, igpu, radeon-780m, radeon-7900xtx, ubuntu, llm, homelab, systemd]
lang: it
description: Cambiare scheda significa anche disfare i workaround. La configurazione di Ollama che girava bene sulla Radeon 780M (gfx1103) è piena di env variabili che sulla 7900 XTX (gfx1100 nativa) sono inutili o attivamente dannose. Cosa togliere, cosa aggiungere, come verificare nel log.
---

**[← Leggi la Parte I: troubleshooting del power management della RX 7900 XTX](/blog/egpu-7900xtx-power-management/)**

---

Nella Parte I ho raccontato come ho aggiunto una RX 7900 XTX come eGPU al Minisforum AI X1 via OCuLink + DEG1, e come ho indagato il power management della scheda fino a verificare che in idle consuma 0 W reali.

Quel pezzo era sull'energia. Questo è sulla **configurazione di Ollama**, perché quando passi da una iGPU integrata a una discreta non basta "collegarla e via": la config di Ollama che ti girava bene sulla Radeon 780M (gfx1103) è piena di workaround che sulla 7900 XTX (gfx1100) vanno rimossi, perché non solo non servono ma sono attivamente dannosi.

Questo articolo documenta la migrazione passo passo: cosa eliminare, cosa aggiungere, perché. Con i numeri reali dei test.

## Lo stato di partenza: Ollama che gira sulla 780M

Prima della 7900 XTX, il mini-PC faceva inferenza usando la sola Radeon 780M (gfx1103), che è la iGPU integrata nel mio Ryzen 7 255 (Zen 4 Hawk Point). La 780M non è ufficialmente supportata da ROCm: la community la fa funzionare facendola "fingere" di essere una gfx1100 con una variabile di override.

Questa era la mia `override.conf` per il servizio systemd:

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

Questa config è corretta per una 780M, ma è anche un compromesso pieno di workaround per far girare ROCm su hardware non ufficialmente supportato. Ogni variabile ha una sua ragione storica.

## Le quattro variabili "iGPU" da analizzare

Prima di toccare qualcosa, è bene capire cosa fa ogni variabile, altrimenti si copincolla configurazioni magiche senza imparare niente. Double check prima di scrivere.

### `HSA_OVERRIDE_GFX_VERSION=11.0.0`

ROCm identifica le GPU AMD tramite l'architettura grafica (gfx version). La libreria HSA (Heterogeneous System Architecture) carica i kernel compilati per quella specifica architettura. La 780M è gfx1103, non supportata di default. Con questa variabile dico a ROCm di trattarla come se fosse gfx1100 (cioè una RDNA 3 desktop tipo 7900 XTX/XT). I kernel di gfx1100 girano comunque sulla 780M perché l'ISA è compatibile.

Sulla 7900 XTX questo override è inutile: è già gfx1100 nativa.

### `HSA_ENABLE_SDMA=0`

SDMA è il System DMA, l'engine hardware AMD che si occupa dei trasferimenti DMA tra VRAM e RAM di sistema senza coinvolgere CPU. Su molte APU (Phoenix, Hawk Point) l'SDMA ha bug noti che causano crash o silenziosi errori di trasferimento. La soluzione è disabilitarlo e usare path di copia alternativi via CPU.

Sulla 7900 XTX SDMA funziona perfettamente, ed è anzi essenziale per le performance: disabilitarlo costringe a transfer più lenti, penalizzando soprattutto il loading dei modelli e i transfer VRAM↔RAM (quando un modello non entra interamente in VRAM).

### `AMD_SERIALIZE_KERNEL=1`

Questa variabile costringe ROCm a eseguire un kernel alla volta, in modo seriale, invece di permettere l'overlap. È un workaround di stabilità per APU che hanno problemi con il command processor in scenari concorrenti. Penalizza pesantemente il throughput.

Sulla 7900 XTX è dannosa: il command processor di Navi 31 è stato progettato proprio per gestire kernel concorrenti, e serializzarli butta via fino al 50% delle performance teoriche su workload paralleli (tipico delle inferenze multi-stream).

### `OLLAMA_MAX_VRAM=49392123904`

Questi sono 49 GB. La 780M non ha VRAM dedicata: usa la RAM di sistema (sui miei 64 GB ne tenevo metà per inferenza). Con questa variabile dicevo a Ollama "fai conto di avere 49 GB di memoria GPU".

Sulla 7900 XTX la VRAM è dedicata: 24 GB esatti. Lasciare 49 GB significa permettere a Ollama di tentare allocazioni che falliranno, oppure di spillare su RAM di sistema in modi inattesi. Va riportata al valore reale (con un piccolo headroom per framebuffer/firmware/contesti). Sidenote: nelle versioni recenti di Ollama (≥0.5.x) la variabile non è più letta — la libreria interroga direttamente il driver ROCm per la VRAM disponibile. Quindi è inutile in entrambi i sensi: o non fa niente, o se la versione vecchia di Ollama la legge, dà un valore sbagliato.

### Le altre variabili (ininfluenti)

- `OLLAMA_INTEL_GPU=0`: disabilita Intel ARC detection. Su AMD non cambia niente, ma evita un check inutile.
- `OLLAMA_HOST=0.0.0.0`: bind su tutte le interfacce di rete. Indipendente dalla GPU.
- `OLLAMA_MAX_LOADED_MODELS=6`, `OLLAMA_NUM_PARALLEL=2`: limiti di concorrenza. Sulla 7900 XTX vanno ricalibrati al ribasso perché la VRAM reale è 24 GB, non 49 GB virtuali.
- `OLLAMA_KV_CACHE_TYPE=q8_0`: quantizzazione 8-bit della KV cache. Va benissimo anche sulla discreta: dimezza la memoria della cache con degrado di qualità trascurabile. La lascio.

## La promessa della migrazione

Riassunto netto di cosa cambia:

| Variabile | Era per 780M (gfx1103) | Sulla 7900 XTX (gfx1100) |
|---|---|---|
| `HSA_OVERRIDE_GFX_VERSION=11.0.0` | Necessaria per finto gfx1100 | Inutile (nativa gfx1100) |
| `HSA_ENABLE_SDMA=0` | Workaround bug APU | Dannosa, va rimossa |
| `AMD_SERIALIZE_KERNEL=1` | Stabilità APU | Dannosa, va rimossa |
| `OLLAMA_MAX_VRAM=49 GB` | Memoria virtuale shared | Sbagliata, va a 22 GB reali o rimossa |
| `OLLAMA_MAX_LOADED_MODELS=6` | OK con 49 GB | Va a 4 (più conservativo) |
| `OLLAMA_KV_CACHE_TYPE=q8_0` | Risparmio memoria | OK lasciare |

In più, due aggiunte importanti:

- `ROCR_VISIBLE_DEVICES=0` + `HIP_VISIBLE_DEVICES=0`: esponi a ROCm/HIP solo la 7900 XTX. La 780M resta invisibile, niente conflitti tra gfx1100 nativa e gfx1100-via-override.
- `OLLAMA_FLASH_ATTENTION=1`: Flash Attention 2, riduce memoria e accelera. Funziona benissimo su gfx1100. Su gfx1103 era instabile, quindi non l'avevo abilitata prima.
- `OLLAMA_KEEP_ALIVE=5m`: dopo 5 minuti di idle, Ollama scarica i modelli dalla VRAM. Il kernel mette la GPU in `suspended` (vedi Parte I sul runtime PM), e il consumo torna a 0 W. È il pattern operativo "uso solo quando serve".

## Diagnostica preliminare: identificare gli indici GPU

Prima di scrivere `ROCR_VISIBLE_DEVICES`, dobbiamo essere sicuri di sapere quale indice corrisponde alla 7900 XTX. La regola dell'oro è non assumere: l'enumerazione dipende dall'ordine PCI e può variare.

L'utility canonica è `rocminfo`, ma sul mio Ubuntu non era installata (Ollama non la espone nel PATH, e l'apt package è troppo vecchio per la 7900 XTX). Ho usato `rocm-smi` con i VBIOS, che è sufficiente:

```bash
rocm-smi -v
```

Output:

```text
GPU[0]: VBIOS version: 113-3E4710U-O4W       ← 3E47 = Navi 31 (7900 XTX)
GPU[1]: VBIOS version: 113-PHXGENERIC-001    ← Phoenix iGPU (780M)
```

I VBIOS rivelano la famiglia hardware: `3E47` è uno dei device ID della famiglia Navi 31, `PHXGENERIC` è esplicito. Conclusione: GPU[0] è la 7900 XTX, GPU[1] è la 780M.

`ROCR_VISIBLE_DEVICES=0` punta correttamente sulla 7900 XTX.

## La nuova configurazione

Backup prima di tutto (safety first):

```bash
sudo cp /etc/systemd/system/ollama.service.d/override.conf \
        /etc/systemd/system/ollama.service.d/override.conf.bak-$(date +%Y%m%d-%H%M)
```

Nuovo file, scritto in modo dichiarativo e commentato:

```ini
# /etc/systemd/system/ollama.service.d/override.conf
[Service]

# === GPU selection ==========================================================
# Esponi a ROCm SOLO la 7900 XTX (GPU[0] confermata da rocm-smi VBIOS 3E47).
# La iGPU 780M (gfx1103) resta invisibile a Ollama. Nessun conflitto.
Environment="ROCR_VISIBLE_DEVICES=0"
Environment="HIP_VISIBLE_DEVICES=0"
Environment="OLLAMA_INTEL_GPU=0"

# === Memoria ================================================================
# Lascio OLLAMA_MAX_VRAM solo per retrocompatibilità con vecchie versioni
# di Ollama. Da v0.5+ è ignorato (Ollama lo legge dal driver ROCm).
# 22 GB = 24 GB - ~2 GB headroom per framebuffer/firmware/contesti
# Environment="OLLAMA_MAX_VRAM=23622320128"

# KV cache 8-bit: dimezza memoria cache, degrado trascurabile
Environment="OLLAMA_KV_CACHE_TYPE=q8_0"

# Flash Attention 2: meno VRAM, più velocità. Stabile su gfx1100.
Environment="OLLAMA_FLASH_ATTENTION=1"

# === Concorrenza ============================================================
Environment="OLLAMA_MAX_LOADED_MODELS=4"
Environment="OLLAMA_NUM_PARALLEL=2"

# Dopo 5 min idle: scarica modelli → GPU torna in suspended → 0 W
Environment="OLLAMA_KEEP_ALIVE=5m"

# === Networking =============================================================
Environment="OLLAMA_HOST=0.0.0.0:11434"
```

Cose che ho **rimosso** rispetto alla config precedente:

- `HSA_OVERRIDE_GFX_VERSION=11.0.0`
- `HSA_ENABLE_SDMA=0`
- `AMD_SERIALIZE_KERNEL=1`
- `OLLAMA_MAX_VRAM=49392123904` (sostituita con default driver)

Cose che ho **aggiunto**:

- `ROCR_VISIBLE_DEVICES=0` + `HIP_VISIBLE_DEVICES=0`
- `OLLAMA_FLASH_ATTENTION=1`
- `OLLAMA_KEEP_ALIVE=5m`

Cose che ho **mantenuto**:

- `OLLAMA_KV_CACHE_TYPE=q8_0` (utile in entrambi gli scenari)
- `OLLAMA_HOST` (rete, indipendente da GPU)
- `OLLAMA_INTEL_GPU=0` (innocuo)

## Apply e verifica nel log

```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
sudo systemctl status ollama --no-pager
```

La verifica veramente importante è leggere il log di startup, dove Ollama dichiara cosa ha trovato:

```bash
sudo journalctl -u ollama --since "2 minutes ago" --no-pager -l \
  | grep -iE "inference compute|library=|gpu=|total=|gfx|rocm"
```

Output significativo:

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

Sei punti di controllo:

| Check | Atteso | Trovato | OK |
|---|---|---|---|
| Library | ROCm (non Vulkan, non CPU) | `library=ROCm` | ✅ |
| Architettura | gfx1100 (no override) | `compute=gfx1100` | ✅ |
| Una sola GPU | iGPU mascherata | un solo `ROCm0` | ✅ |
| Device | 7900 XTX | `AMD Radeon RX 7900 XTX` | ✅ |
| VRAM totale | 24 GB | `total="24.0 GiB"` | ✅ |
| PCI ID | `0000:03:00.0` | OK | ✅ |

Nella mappa env stampata da Ollama è importante notare che `HSA_OVERRIDE_GFX_VERSION` è ora vuota: significa che è stata rimossa correttamente dal drop-in, e ROCm sta usando la gfx1100 nativa della scheda invece di un finto override.

## Test funzionale: i numeri veri

Il vero proof che la migrazione ha funzionato sono i tempi di inferenza. Tre scenari.

### Scenario 1 — Cold start con download

```bash
time ollama run llama3.2:3b "Rispondi con una sola parola: OK"
# real    0m28.689s
```

I 28.7 secondi includono il download di 2 GB del modello da Internet. Non è un benchmark di latenza, è un benchmark della mia connessione + cold start. Una volta sola.

### Scenario 2 — Hot run (modello in VRAM, GPU active)

```bash
time ollama run llama3.2:3b "Rispondi con una sola parola: OK"
# real    0m0.145s
```

145 millisecondi. Di cui 9 ms di user, 18 ms di sys. Il resto è la latenza HTTP localhost + generazione di un token. Per chi viene dalla 780M (dove un singolo token su un modello da 3B ne prendeva 800–1200 ms), è un fattore 6–8x di miglioramento sulla latenza.

### Scenario 3 — Cold start senza download (modello su disco, GPU suspended)

Questo è il caso operativo reale: dopo 5+ minuti di idle, Ollama ha scaricato il modello dalla VRAM, la GPU è andata in `suspended`. Al prossimo prompt:

- ~0.5–1 s: wake-up della 7900 XTX da `suspended` → `active`
- ~1–2 s: reload del modello in VRAM
- <1 s: inferenza

Totale 2–3 secondi. Accettabile per uso interattivo, perfetto per workflow batch. Soprattutto: dopo la prima richiesta, tutto resta caldo per 5 minuti, e dentro quella finestra ogni chiamata torna a essere da 145 ms.

## Lezioni operative

### 1. La configurazione iGPU è un debito tecnico nascosto

Quando ROCm non supporta ufficialmente il tuo hardware, accumuli workaround in cascata: `HSA_OVERRIDE` per forzare la gfx version, `HSA_ENABLE_SDMA` per evitare crash, `AMD_SERIALIZE_KERNEL` per stabilità. Ognuno di questi è una scelta consapevole per quell'hardware specifico, e ognuno di questi diventa zavorra quando passi a hardware supportato. Quando upgradi la GPU, la prima cosa da fare è rivedere ogni env variable da capo, non copincollare la config precedente.

### 2. L'enumerazione GPU non è ovvia

Il sysfs `cardN`, l'output di `rocm-smi`, l'enumerazione di `ROCR_VISIBLE_DEVICES` e quella di `HIP_VISIBLE_DEVICES` possono divergere. La regola di sicurezza è:

1. Identifica la GPU via `lspci` e PCI ID
2. Verifica il VBIOS via `rocm-smi -v` per essere sicuro che l'indice ROCm corrisponda
3. Conferma con il log di startup di Ollama (`inference compute` ti dice esattamente cosa ha trovato)

### 3. KEEP_ALIVE è la chiave del power management collaborativo

Senza `OLLAMA_KEEP_ALIVE`, Ollama tiene i modelli in VRAM per un default di 5 minuti, ma soprattutto tiene la GPU `active`. Questo impedisce al kernel di mettere la scheda in `suspended` via PCI runtime PM, e la 7900 XTX continua a consumare 10–30 W "inutili" anche senza richieste. Impostando esplicitamente `KEEP_ALIVE=5m` (o un valore più basso se preferisci) chiudi il cerchio:

```text
prompt → wake → load → infer
       → 5 min idle → unload → GPU suspended → 0 W
```

### 4. Verifica sempre nel log, non assumere

Ogni cambio di configurazione va validato leggendo cosa Ollama ha effettivamente capito. La mappa env nel log di startup è la fonte di verità: se ci vedi `HSA_OVERRIDE_GFX_VERSION:` vuoto e `compute=gfx1100`, sai che la migrazione è andata bene. Se ci vedi ancora il vecchio override o un `compute=gfx1103`, sai che hai dimenticato un drop-in da qualche parte.

## Conclusione

Migrare Ollama dalla Radeon 780M alla Radeon RX 7900 XTX non significa "aggiungere la nuova GPU", significa rimuovere accuratamente tutti i workaround che servivano per far girare ROCm su hardware non supportato. La configurazione finale è più corta, più dichiarativa, più veloce, e collabora con il power management del kernel per consumare zero watt in idle.

Per chi è in una situazione simile (mini-PC con APU AMD + eGPU AMD discreta), il pattern è chiaro:

1. **Backup** della config esistente
2. **Identifica** la nuova GPU via PCI ID + VBIOS (`rocm-smi -v`)
3. **Rimuovi** tutti gli override iGPU (`HSA_OVERRIDE`, `HSA_ENABLE_SDMA=0`, `AMD_SERIALIZE_KERNEL=1`)
4. **Esponi** solo la discreta con `ROCR_VISIBLE_DEVICES`
5. **Ricalibra** i limiti di VRAM e di concorrenza alla realtà del nuovo hardware
6. **Aggiungi** `OLLAMA_KEEP_ALIVE` per chiudere il cerchio con il power management
7. **Verifica** nel log che Ollama veda esattamente quello che ti aspetti

E sempre, come dico ai miei studenti: safety first, little often, double check.
