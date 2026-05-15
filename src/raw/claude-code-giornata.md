---
title: 66 commit in 10 ore — questo è il mio flusso con Claude Code
date: 2026-05-15
tags: [claude-code, AI, sviluppo, homelab, produttività]
description: Come ho costruito 3 app in produzione in una giornata usando Claude Code. Pianificazione, esame del piano, subagenti e orchestratore — con numeri reali.
---

Oggi ho costruito tre applicazioni da zero e le ho portate in produzione.
Ho esteso un sistema di monitoring da 2 a 10 checker.
Ho completato una pipeline IMAP → LLM → database → dashboard.
Ho fatto 66 commit.

Tutto in circa 10 ore, lavorando da solo.

Non lo scrivo per impressionare. Lo scrivo perché la domanda che mi arriva più spesso — da colleghi, da studenti, da chi inizia a usare questi strumenti — è: *quanto si riesce davvero a fare?* E la risposta onesta è che dipende tutto da **come** lavori con l'AI, non da quanto l'AI sia capace.

Questo articolo racconta il flusso che uso ogni giorno. Con esempi reali da oggi.

## I numeri della giornata

| Progetto | Tipo di attività | Commit |
|---|---|---|
| `proof` | Nuova app da zero → produzione | 8 |
| `newsletter-intel` | Pipeline completa (5 fasi) da zero → produzione | 14 |
| `humble-library-sync` | Nuova app da zero → deploy | 4 |
| `pipeline-monitor` | +8 checker, v3.0.0 | 6 |
| `fonti` + `knowledge-base` | Impact Engine, Fase 3 | 9 |
| `notebooklm-wiki-bridge` | Nuovo workflow TikTok watchdog | 3 |
| Infrastruttura varia | Inventario, Zabbix, fix minori | 22 |

3.066 email in coda nel sistema newsletter-intel, 303 backfillate, 0 errori a fine giornata. 2 template Zabbix deployati. 3 repo Git creati o aggiornati.

![Git log della giornata — 66 commit in 10 ore, organizzati per progetto](images/gitlog-today-cropped.png)

Questi non sono numeri di una demo. È lavoro reale, su infrastruttura reale, in homelab che gira in produzione.

## Il flusso base: plan → review → esegui

Prima di tutto: Claude Code non è un chatbot a cui scrivi "fai questa cosa".

Il flusso che uso ha tre fasi distinte, e saltarne una è il modo più veloce per perdere tempo.

**1. Pianificazione** — costruire il piano prima di scrivere codice

**2. Esame del piano** — verificare prima di dire "vai"

**3. Esecuzione** — con tracciamento esplicito dei task

Andiamo a vederle una per una.

## Pianificazione: costruire il piano prima di scrivere codice

Claude Code ha una modalità chiamata *plan mode*. Quando entro in questa modalità, l'AI non scrive codice: esplora il workspace, legge i file rilevanti e produce un piano strutturato.

Il piano non è un elenco di cose da fare. È un ragionamento esplicito su cosa esiste già e può essere riusato, cosa va costruito da zero, in che ordine, le dipendenze tra i pezzi e dove possono nascere problemi.

Questa mattina, per `newsletter-intel`, ho fornito un brief di una ventina di righe: che tipo di sistema volevo, quali tecnologie usare, dove gira, quali sono i requisiti. Claude Code ha esplorato il workspace, letto i file di contesto del progetto, poi ha prodotto un piano in 5 fasi con acceptance criteria per ogni fase.

Il piano non era perfetto al primo colpo. Aveva assunto che il container avesse accesso a un mount NFS che in realtà non c'era. Lo ha scritto nel piano ("assumo che `/mnt/qnap-public/newsletter-intel` sia disponibile") — e quella riga mi ha permesso di correggerlo *prima* di eseguire qualcosa.

**Regola pratica**: il piano deve essere abbastanza dettagliato da farti vedere i problemi prima che diventino errori a runtime. Se è troppo vago, non è ancora un piano.

## Esame del piano: cosa cerco prima di dire "vai"

Un piano generato dall'AI non va letto in diagonale. Lo esamino con una checklist mentale di quattro domande.

**1. Le assunzioni sono corrette?**
Claude Code descrive sempre le sue assunzioni. Cerco quelle che toccano infrastruttura reale: IP, porte, credenziali, path di file. Ogni assunzione sbagliata qui si trasforma in un bug da debuggare dopo il deploy.

**2. L'ordine delle fasi ha senso?**
Un piano che mette il testing dopo il deploy di produzione non è un buon piano. Guardo se le dipendenze tra fasi sono reali o artificiali.

**3. C'è qualcosa che manca?**
Il piano tende a ottimizzare per lo happy path. Chiedo: cosa succede se il container non parte? se il DB non è raggiungibile? se l'API esterna risponde 429? Non serve un piano per ogni edge case, ma i punti di fallimento critici devono essere identificati.

**4. Il piano è atomico?**
Ogni fase deve produrre qualcosa di verificabile. Non "implementa il backend" — ma "il backend risponde a `/health` con `{"status": "ok"}` e a `/api/items` con una lista JSON". Se non riesco a descrivere come verificare che una fase è completa, quella fase è troppo grande.

Oggi per `proof` — l'app di raccolta testimonianze — ho fermato il piano dopo la prima lettura perché aveva incluso Google OAuth. Google OAuth aveva già senso nella versione iniziale del brief, ma nei giorni precedenti avevo deciso di rimuoverlo. Il piano non lo sapeva. Ho corretto il brief, ho rigenerato, e siamo andati.

## Gestione: come mantengo la direzione su più progetti

In una giornata come quella di oggi, salto tra 6-7 progetti diversi. Il rischio è ovvio: perdo il filo, inizio cose che non completo, mi ritrovo con 3 branch aperte e nessuna conclusa.

Il sistema che uso è semplice.

**Ogni progetto ha file di contesto** in `_context/`: stato attuale, storico delle decisioni, relazioni con altri sistemi, blocchi aperti. Prima di iniziare una sessione su un progetto, carico quel contesto. Non affido la memoria alla conversazione: la conversazione finisce, il file rimane.

**Chiudo ogni sessione con un update.** Prima di passare al progetto successivo, aggiorno `status.md` e `storico.md`. Questa operazione richiede 2-3 minuti e mi salva da "dove ero rimasto?" ogni volta che riapro.

**Uso i task esplicitamente.** Claude Code mantiene una lista di task attivi durante la sessione. Quando un task è completato, lo marco completato. Questo evita di ritrovarsi con 4 cose a metà.

**Non cambio progetto a metà di un task.** Se mi trovo nel mezzo del fix di un bug e arriva l'idea di fare qualcos'altro, la scrivo da qualche parte e finisco quello che ho in mano. Il context switch costa di più con l'AI che senza.

## Subagenti e orchestratore: quando e perché

Questa è la parte che molti trovano confusa, quindi la affronto con un esempio concreto.

Ho un sistema di monitoring che controlla 12 servizi del mio homelab. Prima aveva 2 checker generici. Oggi l'ho esteso a 12 checker specifici, ognuno con la propria logica.

![Pipeline Monitor v3.0.0 — 12 checker attivi, 10 healthy e 2 unhealthy, dati live](images/pipeline-monitor-top.png)

Ogni checker è un modulo indipendente: legge solo i dati che gli servono, produce un output strutturato con `is_healthy` e i dettagli. Un orchestratore di scheduling li chiama tutti in parallelo ogni N secondi e aggrega i risultati in un unico stato.

**Perché questa architettura?**

Primo: ogni checker è *migliore in quello che fa* rispetto a un checker generalista. Se chiedo a un singolo agente di controllare tutto, ottimizza sul tempo e taglia angoli. Se ho un checker specializzato per `litellm_proxy`, quell'agente conosce esattamente quali endpoint testare e cosa significano i valori.

Secondo: posso correggere un pezzo senza rifare tutto. Se il checker di `bookmark_ingest` ha un bug sulla soglia, lo correggo solo lì. Il resto rimane.

Terzo: il parallelismo è reale. I checker non dipendono l'uno dall'altro. Li eseguo in parallelo. Con un singolo processo sequenziale, un checker lento blocca tutti gli altri.

Stesso schema con il sistema di copy del brand: un orchestratore riceve il brief, lo scompone e delega a subagenti specializzati — uno per le big idea, uno per le headline, uno per i bullet point. Ognuno applica il suo framework specifico, produce output strutturato, e l'orchestratore assembla il risultato finale.

**Quando NON usare subagenti:**
- Task semplici che un singolo agente risolve in una passata
- Quando le fasi sono così dipendenti che il parallelismo è impossibile
- Quando il costo di coordinamento supera il beneficio

Se un task richiede meno di 20 minuti di lavoro sequenziale, lo faccio con un agente solo. Costruire un'architettura subagent per qualcosa di piccolo è lavoro che non serve.

## Cosa non ha funzionato

Sarebbe disonesto non dirlo.

**Le variabili d'ambiente.** Ogni nuovo container ha le sue env var, e ogni volta che ne manca una il container parte male o produce errori silenziosi. Oggi `kb-worker` dava 401 su tutte le chiamate a LiteLLM perché `LITELLM_API_KEY` non era nel docker-compose. Il debug ha richiesto 15 minuti.

**La latenza dei build Docker.** Ogni ciclo modifica → build → test → deploy richiede 3-5 minuti. Su una giornata di 66 commit, quello è tempo reale.

**Il revert.** Ho fatto un revert su `fonti` perché il migration runner introdotto in una commit creava un comportamento imprevisto all'avvio. Il revert stesso ha richiesto 2 minuti, ma identificare il problema ha richiesto 20. Claude Code non sbaglia meno degli umani sulle edge case di startup. Sbaglia in modo diverso.

**La memoria cross-sessione.** L'AI non ricorda la sessione precedente. Ogni volta devo ricaricare il contesto. I file di contesto servono esattamente a questo — ma richiede disciplina mantenerli aggiornati.

## Cosa resta dopo 10 ore

![Proof — app testimonial live su proof.lucasacchi.net, costruita e deployata oggi](images/proof-app.png)

Tre applicazioni in produzione con monitoring attivo. Un sistema di pipeline dati completato al 100%. Un sistema di monitoring esteso da 2 a 12 checker. 66 commit atomici con messaggi Conventional Commit. Documentazione aggiornata per ogni progetto toccato.

Quello che non è cambiato: serve ancora capire cosa stai costruendo. Serve ancora progettare prima di implementare. Serve ancora esaminare il piano prima di eseguirlo. Serve ancora sapere come funziona l'infrastruttura su cui gira il codice.

Claude Code non elimina la competenza tecnica. La moltiplica — ma solo se c'è qualcosa da moltiplicare.

---

Se lavori con AI, infrastruttura o homelab e ti interessa questo tipo di contenuto, seguimi su LinkedIn dove pubblico regolarmente.

[Seguimi su LinkedIn → linkedin.com/in/lucasacchi](https://www.linkedin.com/in/lucasacchi/)
