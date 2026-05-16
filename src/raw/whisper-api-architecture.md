---
title: Whisper API — Come ho stravolto l'architettura per scalare la trascrizione
date: 2026-05-04
tags: [architecture, microservices, whisper, api, python, open-source]
---

Pochi giorni fa ho presentato qui Shortcutter, il tool open source che scarica video YouTube, li trascrive e produce un summary strutturato.

Oggi ho ripensato l'architettura e ho deciso di rifare una cosa che sembrava già buona.

## Il problema: il modello embedded

Inizialmente Shortcutter portava con sé `faster-whisper` embedded, il modello caricato localmente in memoria.

Per un video da 60-90 secondi significa 1.5 GB di VRAM occupati da un singolo componente.

Funziona, certo. Ma non scala.

## La soluzione: estrarre il servizio

Invece di tenere il modello dentro lo script, l'ho estratto: ho creato **Whisper API**, un servizio REST su un server LAN dedicato.

Shortcutter ora chiama `POST /transcribe` via HTTP.

Risultato: zero VRAM locale, e il pattern diventa riusabile.

## Cosa è cambiato nella pratica

La trascrizione non vive più dentro lo script: è un servizio a sé. Se domani cambio transcriber (da Whisper a qualcos'altro), aggiorno solo l'API e nessuno dei client se ne accorge.

Sul piano modelli, da remoto posso usare `large-v3-turbo` senza pagare il costo di VRAM in locale. Cambio il parametro `model=` e fatto.

Sul piano riuso, TikTok Downloader, Shortcutter e TwinScribeAI parlano tutti con lo stesso endpoint. Una sola fonte di verità, niente codice di trascrizione duplicato in tre progetti.

E il confine tra "cosa fa lo script" e "cosa fa il servizio" diventa ovvio. Che è la cosa che, alla fine, ti fa risparmiare più tempo di tutte.

## Non è un refactor per farsi bello

Non è un refactor estetico. È una decisione pratica: separare le responsabilità rende il codice più onesto. Chi lavora su pipeline con AI sa che questi piccoli spostamenti di confine, "cosa vive dove", cambiano il modo in cui ragioni sui problemi.

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
