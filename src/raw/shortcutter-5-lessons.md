---
title: Shortcutter — 5 lezioni da una giornata di coding con LLM locali
date: 2026-05-02
tags: [ai, llm, whisper, self-hosted, python, open-source]
---

Seguo ogni giorno un canale YouTube italiano, ZioBudda Labs, che pubblica news AI in formato shorts da 2 minuti. Pieno di tool, repo, modelli che vorrei provare.

Problema: i link non ci sono. Non nella description del video, non nella bio del canale. Solo a voce, nello short. E quando guardi 30 video al mese, perdi meta delle informazioni.

Così oggi mi sono detto: "costruisco una pipeline che li scarica, li analizza con AI locale, mi tira fuori un digest giornaliero via email. Tutto self-hosted, zero API esterne, zero costi ricorrenti."

Stamattina credevo fosse mezza giornata di lavoro. Stasera ho 3 script Python, 9 versioni iterative, 4 bug critici risolti, e una sola certezza: i modelli piccoli ti tradiscono in modi creativi.

5 lezioni dalla giornata.

### 1. Quando un LLM da 4B parametri non trova un repo GitHub nella description, lo inventa.

Sempre con "anthropics/" davanti. La soluzione: HEAD request. Il repo esiste? No? Cancello l'URL. Controlla prima, fai affidare dopo.

### 2. Il fixer LLM che corregge 19 errori Whisper su un transcript lungo diventa peggio del raw sotto i 1500 caratteri.

"Troppo prompt per troppo poco lavoro." Lezione: skip e basta. Se il testo e troppo corto per il modello, il fix non aggiunge valore, solo rumore.

### 3. Un sanity check di 5 righe ha salvato la giornata.

Il LLM ha provato a sostituire il transcript con la description del video. Un "se differenza > 30%, torna al raw" ha bloccato il disastro. Sembra banale. E oro.

### 4. A volte non e la pipeline a sbagliare: e il creator che carica un video con l'audio mescolato.

Caso reale trovato oggi. La cosa piu onesta che il mio sistema fa e dire "non lo so" quando i dati sono incoerenti.

### 5. Le 3 regole che ripeto sempre ai miei studenti hanno fatto la differenza piu di qualsiasi prompt o LLM.

Safety first — sanity check, validazioni, fallback.
Little often — 9 piccole versioni invece di un big-bang.
Double check — un occhio attento ha trovato un bug Python (variable shadowing) che riduceva un transcript di 3.400 caratteri a 3. "ola". Tre caratteri. Senza accorgermi.

La cosa che mi porto a casa: quando costruisci un sistema basato su LLM, non puoi sperare che il modello "si comporti bene". Devi assumera che fara casino e progettare resilienza intorno.

La pipeline robusta e quella che intercetta i suoi stessi errori prima che lo facciano i tuoi utenti.

Stack: Python, Whisper, Ollama (qwen3.5:4b + llava:7b), n8n, tutto su iGPU AMD 780M con ROCm. Niente cloud, niente API.

Grazie a Ziobuddalabs per il contenuto quotidiano di qualita che mi ha fatto venire voglia di costruire questo sistema.

---

👉 YouTube: youtube.com/@ziobuddalabs
🤖 Repo: https://lnkd.in/dYFiM884
💻 Demo: https://lnkd.in/dRbMimgn

Chi ha esperienze simili con modelli piccoli? Scrivimi nei commenti.
