---
title: Model Manager — Come gestisco la VRAM quando troppi agenti vogliono girare insieme
date: 2026-05-04
tags: [homelab, ollama, api, queue, docker, python, open-source]
---

Nel mio homelab gira un server Ollama su `192.168.254.115` — 64 GB di RAM, GPU condivisa, niente cloud. Su questa macchina urlano 5 agenti:

- TikTok Downloader (trascrizione di video)
- Shortcutter (download + summary YouTube)
- n8n (workflow AI)
- Skill Claude (agenti personalizzati)
- embed-bookmarks.sh (embedding di appunti)

Inizialmente tutti facevano quello che gli pareva: caricavano il modello quando gli serviva, lo scaricavano quando finivano. Facile.

Fino a quando non lo è più.

## Il problema: il free-for-all

Senza coordinamento, ecco cosa succede.

Due agenti chiedono il modello `whisper-large-v3` nello stesso momento. Entrambi vedono "non è in VRAM" e lo caricano. Risultato: 3 GB di VRAM occupati dal duplicato. Inutile.

TikTok Downloader finisce la trascrizione e scarica il modello (keep_alive=0). Ma in quel momento shortcutter gli sta facendo il secondo chunk. Crash silenzioso.

Chi sta usando cosa? Misterio. Non c'è visibilità.

## La soluzione: prenotazioni per-modello

Ho creato **Model Manager**, un'API REST che funziona come un semaforo intelligente.

Quando un agente vuole un modello, non lo carica direttamente. Lo **prenota**:

```bash
curl -X POST http://192.168.254.115:5000/reservations \
  -d '{"model": "whisper-large-v3", "client": "tiktok-downloader", "timeout": 300}'
```

La risposta è una di queste:
- `status: active` — il modello è tuo, è in VRAM, vai
- `status: queued` con `position: 2` — c'è gente davanti, aspetta

Quando finisci, lo rilasci:

```bash
curl -X DELETE http://192.168.254.115:5000/reservations/{id}
```

E il prossimo in coda viene attivato automaticamente.

## Come funziona nella pratica

Client A prenota whisper → active (carica in VRAM).
Client B prenota lo stesso modello → queued, posizione 1.
Client C prenota lo stesso modello → queued, posizione 2.

A finisce, rilascia. Il sistema attiva B. B sa che il modello è pronto, inizia a usarlo.
B finisce, rilascia. C viene attivato.

Nessun duplicato. Nessun crash. Coda rispettata.

Per i modelli diversi il sistema non si blocca: whisper e qwen3.5 possono caricarsi contemporaneamente (hanno lock separati, uno per modello). Non globale, per-modello.

## Cosa ho guadagnato

**Niente crash.** Se un agente dimentica di rilasciare? Auto-expire dopo 5 minuti (configurabile). Il modello si scarica e il prossimo viene attivato.

**Visibilità.** Chiamo:

```bash
curl http://192.168.254.115:5000/reservations/queue
```

E vedo l'intera coda, chi ha il lock, chi aspetta, per quanto tempo ancora.

**Scalabilità stupida.** Tre agenti in più? Non cambia niente. Continuano a prenotare.

**Riusabilità.** Lo stesso servizio è usato da TikTok Downloader, shortcutter, n8n, skill Claude. Una sola fonte di verità.

## Il repository e l'API

Ho pubblicato il codice come open source: **https://github.com/lucasacchiricciardi/model-manager** (MIT license).

Contiene:
- FastAPI REST service
- SQLAlchemy async con SQLite (o PostgreSQL, se vuoi scalare)
- Per-model reservation queue con auto-expire
- Swagger per fare i test direttamente dal browser: **http://192.168.254.115:5000/docs**
- V1 endpoint retrocompatibili (load/unload diretto, se vuoi ignorare la coda)
- Test concorrenti inclusi

L'API gira in Docker, ovviamente. Containerizzato, riavviabile, stateless, database persistito.

## La lezione

Gli asyncio.Lock non servono solo quando stai scalando a milioni di utenti.

Servono anche quando sei tu il solo utente, ma hai 5 processi indipendenti che si contendono la stessa GPU.

"Che bravo che sei" non è il punto. Il punto è: il codice che ragiona su "who gets the resource when" diventa molto meno fragile quando il coordinamento è **esterno** e **visibile**.

Stack: FastAPI, SQLAlchemy async, SQLite, Docker, aiosqlite, httpx.

Niente cloud, niente serverless, niente costi ricorrenti.

Vale la pena.
