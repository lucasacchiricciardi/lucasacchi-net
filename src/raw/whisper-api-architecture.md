---
title: Whisper API — Come ho stravvolto l'architettura per scalare la trascrizione
date: 2026-05-04
tags: [architecture, microservices, whisper, api, python, open-source]
---

Pochi giorni fa ho presentato qui Shortcutter, il tool open source che scarica video YouTube, li trascrive e produce un summary strutturato.

Oggi ho ripensato il pattern architetturale, e ho deciso di stravolgere una cosa che sembrava già buona.

## Il problema: il modello embedded

Inizialmente Shortcutter portava con sé `faster-whisper` embedded — il modello caricato localmente in memoria.

Per un video da 60-90 secondi significa 1.5 GB di VRAM occupati da un singolo componente.

Funziona, certo. Ma non scala.

## La soluzione: estrarre il servizio

Invece di tenere il modello dentro lo script, l'ho estratto: ho creato **Whisper API**, un servizio REST su un server LAN dedicato.

Shortcutter ora chiama `POST /transcribe` via HTTP.

Boom — zero VRAM locale, e il pattern diventa riusabile.

## Cosa è cambiato nella pratica

**Decoupling**: trascrizione non è più dentro lo script, è un servizio. Se domani cambio transcriber (da Whisper a un altro), aggiorno solo l'API.

**Flessibilità dei modelli**: da remoto posso usare `large-v3-turbo` senza pagare il costo di VRAM locale. Cambio il parametro `model=` e fatto.

**Scalabilità**: TikTok Downloader, Shortcutter, TwinScribeAI possono tutti chiamare lo stesso servizio. Una sola fonte di verità.

**Chiarezza**: il confine tra "cosa fa il mio script" e "cosa fa il servizio" diventa ovvio.

## Non è un refactor per farsi bello

Questo non è un refactor per farsi bello.

È una decisione pratica: **separare le responsabilità rende il codice più onesto**.

Chi lavora su pipeline con AI sa che questi piccoli spostamenti di confine — "cosa vive dove" — cambiano come ragioni sui problemi.

## Il repository

Ho pubblicato il codice come open source: **https://github.com/lucasacchiricciardi/whisper-api** (MIT license)

Contiene:
- FastAPI REST service per audio transcription
- Support per 6 Whisper models (tiny a large-v3-turbo)
- Docker containerization
- Lazy model loading con caching
- Health check + status endpoints
- Model lifecycle management (load/unload)

Il servizio è già in produzione su 192.168.254.115:5001 nel mio homelab, usato da TikTok Downloader e Shortcutter.

## La lezione

La scala non è solo "quanti utenti servono", è anche "come organizzo il codice per farlo crescere senza rompersi".

Questo cambiamento non ha aggiunto una feature. Ha reso la codebase più ragionevole.

Vale la pena.
