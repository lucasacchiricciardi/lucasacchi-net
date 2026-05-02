---
title: Shortcutter — 5 lezioni da una giornata di coding con LLM locali
date: 2026-05-02
tags: [ai, llm, whisper, self-hosted, python, open-source]
---

Seguo ogni giorno un canale YouTube italiano, ZioBudda Labs, che pubblica news AI in formato shorts da 2 minuti. Pieno di tool, repo e modelli che vorrei provare.

Problema: i link non ci sono. Non nella description del video, non nella bio del canale. Solo a voce, nello short. E quando guardi 30 video al mese, perdi metà delle informazioni.

Così stamattina mi sono detto: costruisco una pipeline che li scarica, li analizza con AI locale e mi tira fuori un digest giornaliero via email. Tutto self-hosted, zero API esterne, zero costi ricorrenti.

Credevo fosse mezza giornata di lavoro. Stasera ho 3 script Python, 9 versioni iterative, 4 bug critici risolti e una sola certezza: i modelli piccoli ti tradiscono in modi creativi.

Ecco 5 cose che ho imparato.

### 1. Quando un LLM da 4B parametri non trova un repo GitHub nella description, lo inventa

Sempre con `anthropics/` davanti. La soluzione: HEAD request. Il repo esiste? No? Cancello l'URL. Controlla prima, fidati dopo.

### 2. Il fixer LLM che corregge 19 errori di Whisper su un transcript lungo diventa peggio del raw sotto i 1.500 caratteri

"Troppo prompt per troppo poco lavoro." Lezione: saltalo. Se il testo è troppo corto per il modello, il fix non aggiunge valore — aggiunge rumore.

### 3. Un sanity check di 5 righe ha salvato la giornata

Il LLM ha provato a sostituire il transcript con la description del video. Un "se la differenza è sopra il 30%, torna al raw" ha bloccato il disastro. Sembra banale. È oro.

### 4. A volte non è la pipeline a sbagliare: è il creator che ha caricato un video con l'audio mescolato

Caso reale trovato oggi. La cosa più onesta che il mio sistema fa è dire "non lo so" quando i dati sono incoerenti.

### 5. Le 3 regole che ripeto ai miei studenti hanno fatto più differenza di qualsiasi prompt o modello

**Safety first** — sanity check, validazioni, fallback.  
**Little often** — 9 piccole versioni invece di un big-bang.  
**Double check** — un'occhiata attenta ha trovato un bug Python (variable shadowing) che riduceva un transcript da 3.400 caratteri a 3. "ola". Tre caratteri. Senza che me ne accorgessi.

---

La cosa che mi porto a casa: quando costruisci un sistema basato su LLM non puoi sperare che il modello si comporti bene. Devi assumere che farà casino e progettare la resilienza intorno a quello.

La pipeline robusta è quella che intercetta i suoi stessi errori prima che li vedano i tuoi utenti.

Stack: Python, Whisper, Ollama (qwen 2.5 4B + llava 7B), n8n, tutto su iGPU AMD 780M con ROCm. Niente cloud, niente API.
