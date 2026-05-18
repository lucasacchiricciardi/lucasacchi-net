---
title: Come ho classificato 46.878 libri — i quattro livelli che convergono
date: 2026-05-18
tags: [book-catalog, architecture, automation, llm, homelab]
lang: it
description: Hit rate dell'LLM fermo al 61%, tassonomia esplosa da 29 a 155 categorie. Quattro livelli di fallback specializzati per arrivare a 80% senza tirare fuori un modello più grosso.
---

Una mattina di maggio guardo la dashboard di book-catalog e c'è una cosa che non torna. 46.878 libri in coda, hit rate dell'LLM fermo al 61%, tassonomia esplosa da 29 categorie iniziali a 155 proposte dal sistema. Non è un disastro: è un plateau. Il modello classifica bene quello che conosce e ignora il resto.

Questo è il momento in cui si capisce che il problema non è il modello. È l'architettura.

Quello che racconto qui è come ho trasformato quel plateau in una cascata di quattro fallback specializzati: ognuno fa la sua parte fino a un certo punto, poi passa la palla al successivo. Non è una storia di modelli più grandi o training set più intelligenti. È una storia di cosa succede quando smetti di chiedere a un solo strumento di fare tutto.

## Il plateau dell'LLM

Per i primi due mesi ho usato un LLM via proxy per classificare i libri. Scelta sensata: latenza accettabile (300-500 ms a richiesta), copertura ampia, e il modello conosce il mondo intero, non solo il dominio dei miei 46.000 libri.

Hit rate del 61% su tutta la popolazione. Le categorie generiche (fantasy, mystery, science fiction) e i titoli riconoscibili (Harry Potter, Dune, 1984) entrano in categoria senza fatica. Il 39% restante è dove si vede il problema: il modello inizia a indovinare male, spesso fallisce in silenzio o piazza il libro in una categoria fallback generica che rende la ricerca inutile.

A questo punto le strade sono due. La prima: provo con un modello più grande. Sarebbe la mossa più scontata, e anche la più cara. La seconda: aggiungo un Plan B che non cerca di essere "più intelligente", ma che guarda il contesto da un'angolazione diversa.

Ho scelto la seconda.

## Livello 2 — PyMuPDF e i pattern del documento

Quando la confidence dell'LLM scende sotto 0.5, o la categoria predetta non esiste nella tassonomia, passo al livello 2: apro il PDF.

Estraggo le prime 15 pagine con PyMuPDF, cerco pattern testuali. Indici, sommari, keyword ripetute, dichiarazioni di genere scritte dal documento stesso. Il libro spesso descrive cosa è senza bisogno di un LLM che lo interpreti: basta leggerlo nella lingua della struttura.

Risultato: il 68% dei fallimenti LLM si risolvono qui. Un manuale tecnico ha una sezione "Contenuti" che dice "Capitolo 3: Networking". Una biografia accademica ha "Prefazione del curatore". Un romance ha scene riconoscibili da keyword. Non è magia, è che il documento ha già fatto il lavoro di auto-descrizione.

Costo: 200-400 ms per estrazione e matching. Da 61% di hit rate salgo a 75%.

## Livello 3 — scikit-learn e la memoria del training set

E quando il PDF è corrotto? Quando le prime 15 pagine sono bianche? Quando l'OCR fallisce su una scansione cattiva?

Qui entra il livello 3: un classificatore scikit-learn addestrato su 28.578 file già categorizzati manualmente nelle sessioni precedenti. Niente di sofisticato: TF-IDF + logistic regression su token di titolo, autore e metadata. Accuracy sul test set: 62%.

Sembra bassa, e lo è in assoluto. Ma il modello non sta cercando di capire il mondo: sta cercando di capire il *mio* dominio specifico di 46.000 libri. Ha visto categorie ibride, autori minori, tassonomie anomale che un LLM non incontra mai. Il 62% è probabilmente l'upper bound razionale per un dominio dove il resto dei pattern è rumore umano.

Quando lo score scende sotto 0.5, il modello non prova a indovinare. Passa al livello successivo.

Da 75% salgo a 79%.

## Livello 4 — Ollama locale come confessionale

Rimane il 21%. File dove l'LLM ha ceduto, PyMuPDF non ha trovato pattern, scikit-learn ha indovinato sotto confidence. Ultimo tentativo prima di arrendersi.

Qui uso `qwen2.5:3b`, un modello piccolo che gira su Ollama in locale (zero latenza extra, zero chiamate API). Non è "il modello finale intelligente". È il confessionale: il sistema arriva con tre fallimenti precedenti annotati e chiede a un modello piccolo di provare con quello che resta.

Quello che ho notato è che quando il modello piccolo riceve il contesto dei tre fallimenti precedenti, le risposte diventano sorprendentemente buone. Non perché sia un modello smart, ma perché sa di operare ai margini e fa scelte più caute.

Hit rate finale nel batch di validazione: 80%.

## Cosa fa ogni livello

Ricapitolo:

- **Livello 1 (LLM via proxy)**: classifica quello che è universale. Cede sotto confidence 0.5.
- **Livello 2 (PyMuPDF)**: legge il documento. Cede quando il file è corrotto o senza pattern utili.
- **Livello 3 (scikit-learn locale)**: usa la memoria del training set specifico. Cede quando i pattern del dominio collidono.
- **Livello 4 (Ollama qwen2.5:3b)**: ultimo tentativo con contesto dei fallimenti. Restituisce sempre qualcosa.

Nessuno cerca di vincere tutto. Ognuno fa quello che sa, e quando esce dal suo dominio passa al successivo. Non è ridondanza (non sto rifacendo lo stesso lavoro quattro volte). Sono quattro specialisti diversi che si scambiano il testimone in base a un segnale di confidence.

Il dettaglio importante è che ogni livello passa al successivo non solo il proprio output, ma anche la propria incertezza. Il livello 4 sa che gli altri tre hanno ceduto. Quel sapere è quello che gli fa cambiare strategia.

## Le metriche

Il 16 maggio lancio un batch di validazione su 10.000 libri casuali. L'LLM da solo fa 61% di hit rate. Sono i numeri che mi avevano frustrato per settimane: non pessimi, ma incapaci di andare oltre.

Poi accendo il livello 2. Hit rate sale a 75%. Non è solo un +14% numerico: è una domanda diversa fatta allo stesso dataset. I 1.400 libri che l'LLM non aveva capito, il 68% di loro parla la lingua della struttura del documento.

Accendo il livello 3. Hit rate sale a 79%. +4%, e qui è risonanza interna: il classificatore non scopre pattern nuovi, conferma e affina quello che i livelli precedenti hanno proposto, con la memoria del training set.

Accendo il livello 4. Hit rate finale: 80%. +1% che sembra poco, ma rappresenta il 20% dei fallimenti precedenti — i casi dove gli altri tre livelli non avevano niente di solido su cui appoggiarsi.

Con questo framework il batch iniziale di 10.000 libri è stato processato interamente. Batch 2 di 20.000 libri è partito autonomo, senza supervisione. Total classificati: 30.000 su 46.878 (64% di coverage).

In parallelo la tassonomia si è espansa. Dalle 29 categorie iniziali (rigide, istituzionali) sono arrivato a 155 categorie proposte dal sistema. Di queste: 84 italiano-native (saggi, narrativa italiana, specialistica locale), 71 internazionali. Nessuno slug è arrivato da una decisione mia. Sono emersi tutti dalla ricorsione naturale dei quattro livelli, batch dopo batch.

### Cosa significano questi numeri

L'80% di hit rate non è perfezione. Audit manuale su 30 libri casuali: 24 corretti, 6 in margini ambigui ma categorizzabili (un fantasy etichettato come "fantasy-antropologico" invece che puro, un thriller geopolitico invece che generico). Questi non sono errori caotici. Sono fallimenti che il prossimo batch sa già come trattare: categorie non previste, PDF corrotti, titoli in lingue poco rappresentate.

L'80% non era l'obiettivo del design. Non ho detto: "voglio 80%, quindi costruisco quattro livelli". Ho detto: "voglio un sistema dove ogni componente sa quando non sa". E l'80% è emerso di conseguenza.

Se avessi cercato solo il numero, avrei aggiunto VRAM al modello LLM, speso il doppio del budget, hackerato il primo livello fino all'osso. Avrei probabilmente raggiunto 70-72% e fermato lì.

## Tre cose che porto a casa

**L'automazione robusta non è "più intelligente". È più consapevole.**

L'LLM del livello 1 non diventa più intelligente quando lo combino con PyMuPDF. Ma il sistema complessivo diventa consapevole dei propri limiti, perché ogni livello passa al successivo sia l'output che il confidence score. Quella metainformazione è tutto quello che serve.

La robustezza non vive nel singolo modello. Vive nell'architettura che lo circonda. Non è questione di *quale* modello usi: è questione di *come* i modelli si parlano quando falliscono.

**La metrica arriva dopo, non guida il design.**

Conto 80% di hit rate, ma il numero arriva *dopo* che il sistema è stato costruito. Se non avessi avuto la struttura di fallback, non potrei nemmeno contare il 61% dell'LLM come punto di partenza: potrei solo lamentarmi che "qualcosa non funziona, ma non so cosa".

I numeri diventano visibili solo quando il sistema è trasparente su dove fallisce. Vuoi replicare questo risultato in un progetto tuo? Non partire dal numero target. Parti dalla domanda: "Come faccio a sapere quando il sistema ha fallito, e in che livello?". Se rispondi bene, la metrica arriva da sola.

**La tolleranza al fallimento è il fondamento, non un'aggiunta tardiva.**

Nel mondo "agile" la tolleranza al fallimento è spesso la cosa che aggiungi *dopo*, se hai tempo. "Abbiamo il core, il graceful degradation lo mettiamo in v2". Qui ho fatto il contrario. Ogni livello esiste perché il precedente *potrebbe* fallire. Non per pessimismo, ma perché in produzione il caos è garantito.

Conseguenza concreta: quando lancerò il batch 3, non lo farò alla cieca. So che il 20% marginale di fallimento batch-to-batch graviterà attorno ai PDF corrotti, alle categorie nuove, ai titoli in lingue non latine. Ho architettato il successo e anche la fallibilità prevedibile.

---

Detto questo: nello stesso giorno in cui la classificazione convergeva pulita verso l'80%, un altro pezzo del progetto stava fallendo in silenzio. Stesso pensiero architetturale richiesto, decisione opposta, conseguenze diverse.

**[Leggi la Parte II: Perché la migrazione del filesystem è fallita (e cosa insegna)](./book-catalog-migrazione/)**
