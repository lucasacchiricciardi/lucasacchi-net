---
title: Perché la migrazione del filesystem è fallita (e cosa insegna)
date: 2026-05-18
tags: [book-catalog, automation, debugging, nfs, qnap, infrastructure]
lang: it
description: 6.430 path aggiornati nel database, zero file mossi nel filesystem. Silent failure su NFS verso QNAP. La storia di un debugging in quattro ipotesi e una sorpresa nascosta nelle ACL della share.
---

**[← Leggi la Parte I: Come ho classificato 46.878 libri](./book-catalog-classificazione/)**

---

Se la classificazione è andata bene, perché la migrazione no? Due pezzi dello stesso progetto, disegnati nello stesso giorno, con esito opposto.

Mentre i quattro livelli di classificazione convergevano sull'80%, dovevo affrontare un'altra cosa: riorganizzare il filesystem. 43.337 file sparsi in tre vecchie location (`/Download/`, `/Mega.com/`, `/Deposito/`) dovevano migrare verso una nuova struttura in `/Bookz/Uncategorized/{topic}/`. Non un task acrobatico: avevo il DB aggiornato, i path calcolati, i nomi dei file risolti con counter per evitare collisioni. Sulla carta tutto in piedi.

E poi è successa una cosa strana. 6.430 path aggiornati nel database. Zero file spostati nel filesystem. Niente. Il sistema procedeva come se tutto andasse bene. Log puliti. DB coerente. Ma il filesystem — il posto dove i file vivono davvero — era fermo, immobile, indifferente.

Non era un problema di volume. Non era complessità. Era un'assunzione invisibile che aveva spaccato tutto. La storia di come l'ho scoperta — quattro ipotesi sbagliate prima di trovarla — insegna più di quando le cose vanno bene.

## Il piano

Era un piano conservativo, fatto da uno che ha visto migliaia di task DevOps.

**Phase 1**: identificare i 3.541 file già dentro `/Bookz/` con una struttura legacy (directory tipo `BookzOld-2024/` o `Archive_backup/`). Questi file erano già "a casa" ma con indirizzo sbagliato. Missione: aggiornare il path nel database senza toccare il filesystem.

**Phase 2**: identificare i 43.337 file sparpagliati nelle tre vecchie location. Creare la nuova struttura di directory in `/Bookz/Uncategorized/{topic}/` prima di muovere un solo file. Poi `shutil.move()` da vecchia location a nuova, uno per uno. Infine aggiornare il database. Ordine critico: albero creato → file mossi → DB aggiornato. Non il contrario.

Per evitare collisioni di nome, contatori. Se due file si chiamavano `philosophy-book.pdf` in location diverse, il secondo diventava `philosophy-book__2.pdf`, il terzo `philosophy-book__3.pdf`. Semplice, prevedibile, reversibile.

Tutto disegnato, tutto testato in dry-run su un subset di 200 file. Funzionava.

### Perché sembrava solido

Il database aveva un `UNIQUE constraint` sulla colonna `filesystem_path`: se qualcosa fosse andato male con i path duplicati, il DB avrebbe rifiutato.

Il mount NFS verso la QNAP era stato remontato `rw` nella sessione precedente, e `df -h` confermava 2.1 TB liberi. Le permission QNAP erano aggiornate: la subnet `192.168.254.0/24` aveva accesso in lettura-scrittura su tutte le share.

Logica di contatore implementata, testata, pronta. Tutta la logica in Python, commit su git, dry-run pulito.

Sulla carta era il piano di qualcuno che sa cosa sta facendo.

### L'esecuzione

**Phase 1**: 3.536 INSERT/UPDATE committed (4 skip per encoding error). ✅
**Phase 2 planning**: 2.889 file identificati nelle tre vecchie location. Directory target create in `/Bookz/Uncategorized/`. 29 topic directories. ✅
**Phase 2 database**: 2.889 path transformation calcolati e committed in transazione singola. Vincolo UNIQUE verificato, nessun duplicato. ✅
**Phase 2 filesystem**: 0/2.889 file mossi. ❌

Il codice era questo:

```python
for file_id, old_path, new_path in migration_list:
    try:
        shutil.move(old_path, new_path)
        db.update_file_location(file_id, new_path)
    except Exception as e:
        logger.error(f"Move failed for {file_id}: {e}")
```

Niente eccezione sollevata. Niente errore nel log. Il ciclo termina normalmente. Quando vado a controllare il filesystem con `ls -la /Bookz/Uncategorized/` — niente. Zero file.

Il database dice che sono lì. Il filesystem dice il contrario.

Silent failure. Il nemico dei sistemi automatizzati. Non è un crash drammatico dove tutto si rompe e lo capisci subito. È peggio: il sistema ti crede, il log dice "tutto ok", il processo termina, e quando vai a verificare la realtà fisicamente non c'è niente. È come scrivere a `/dev/null`: il processo continua, la pipe rimane aperta, il segnale di output ritorna "scritto", ma i dati scompaiono nel vuoto.

## Quattro ipotesi prima della verità

Quando scopri che 2.889 file dovevano essere mossi e 0 sono stati toccati, il primo istinto è cercare l'errore ovvio. Eccezione non catturata? Permessi? Mount read-only? Quattro piste, quattro vicoli ciechi prima della rivelazione.

### Ipotesi 1: il mount è ancora read-only

Primo istinto: il remount verso la QNAP non ha avuto effetto. Magari `mount -o rw,remount /mnt/qnap-nfs` non è stato eseguito davvero, magari il kernel ancora crede al mount `ro`.

Verifica:
```
$ df -h /mnt/qnap-nfs
Filesystem                  Size  Used Avail Use% Mounted on
192.168.254.150:/Bookz     10.0T  3.5T  6.5T  35% /mnt/qnap-nfs
Type: nfs4
Options: rw,noatime,vers=4.1,...
```

Mount `rw`. Test esplicito: `touch /mnt/qnap-nfs/test-write`. Il file si crea. `cat` funziona. Il kernel considera il mount leggibile-scrivibile.

Non è il mount.

### Ipotesi 2: il problema è nei percorsi

Secondo istinto: forse i file vecchi non vengono trovati. `os.path.exists()` dice che il file non esiste, e `shutil.move()` fallisce in silenzio.

Verifica su tutte le 2.889 coppie:
```python
from pathlib import Path
for old in sample_paths:
    assert Path(old).exists(), f"FAIL: {old}"
    assert Path(old).is_file(), f"Not a file: {old}"
```

Tutti green. 2.889/2.889 file esistono, Python li vede, sono accessibili.

Non è path resolution.

### Ipotesi 3: il problema sono le ACL QNAP

Terzo istinto: forse la share NFS è restrittiva. La lettura passa, ma la write è bloccata dal server.

Audit ACL QNAP da web UI (`192.168.254.150:8080` → Storage Manager → NFS Access Rights). La subnet `192.168.254.0/24` ha read, write ed execute tutti `allowed`.

Per essere sicuro, SSH diretto sulla QNAP:
```bash
touch /Bookz/Uncategorized/test-qnap.txt
echo "hello" > /Bookz/Uncategorized/test-qnap.txt
mv /Bookz/Uncategorized/test-qnap.txt /Bookz/Uncategorized/test-moved.txt
ls -la /Bookz/Uncategorized/test-moved.txt
```

Tutto green. Da lato QNAP la write funziona perfettamente.

Non sono le ACL QNAP (almeno non quelle).

### Ipotesi 4: il kernel NFS sta cachando metadata

Quarto istinto, il più sofisticato. NFS può cachare metadata. Il kernel crede che il file sia lì, ma quando il client prova davvero a riscrivere — l'operazione atomica di move — il server NFS dice di no, e il client invece di sollevare un'eccezione ritorna in silenzio.

Capita raramente, ma con NFS non è impossibile. Stale inode cache, ACL cachate, o un client `soft` che dopo N retry "rinuncia" senza notificare al processo.

Umount e remount con opzioni esplicite:
```bash
sudo umount /mnt/qnap-nfs
sudo mount -t nfs4 \
  -o noatime,nocto,soft,timeo=10,retrans=2 \
  192.168.254.150:/Bookz /mnt/qnap-nfs
```

Retry della migrazione: 0/2.889. Niente.

Secondo tentativo, opzioni opposte:
```bash
sudo mount -t nfs4 \
  -o atime,cto,hard,timeo=600,retrans=3 \
  192.168.254.150:/Bookz /mnt/qnap-nfs
```

Retry: 0/2.889. Ancora niente.

Non è cache NFS. È più profondo.

### Il momento in cui ho capito

Mentre rifaccio la prova noto un dettaglio. Le directory create in `/Bookz/Uncategorized/` esistono (`ls -la` le mostra), ma quando provo a creare un file dentro **da client Linux** (non da QNAP SSH):

```bash
touch /mnt/qnap-nfs/Uncategorized/fantasy/test-client.txt
```

Il comando termina senza errore. Ma `ls -la` dopo: niente.

Eccolo. Non è l'intero mount che è read-only. È un livello sotto. `/Bookz/` è RW (le directory si creano), ma `/Bookz/Uncategorized/` ha qualcosa di diverso.

SSH sulla QNAP, controllo le ACL locali della cartella:
```bash
$ ls -lda /Bookz/Uncategorized/
drwxr-xr-x  31 admin root  4096 May 17 12:15 /Bookz/Uncategorized
$ stat /Bookz/Uncategorized/
  Access: (0755)
  Uid: ( 1000/admin)  Gid: (   32/root)
  NFS Export: /Bookz (ro for guest, rw for authenticated)
```

La directory è 775 sul filesystem locale, ma l'export NFS di `/Bookz/` ha una politica differenziata: la root è RW per i client autenticati, **ma le sottodirectory create dopo il mount ereditano un default conservativo che non lo è**. La cartella è leggibile dal client (per quello `ls` funziona), ma la scrittura è bloccata al livello di protocollo NFS.

Quello che succede a livello kernel è che il server NFS risponde con un `NFSERR_ACCES` (o simile), ma `shutil.move()` non cattura quel ritorno come eccezione. Il move "ritorna ok", il file rimane dov'era, e il processo continua.

Perché il silent failure? Il kernel NFS, quando riceve un rifiuto dal server, ha due comportamenti:
1. Se il mount è `hard` (default storico), il client riprova all'infinito e il processo si blocca.
2. Se il mount è `soft`, dopo N retry il client rinuncia in silenzio e ritorna il controllo al processo, non sempre alzando un'eccezione.

Nel mio caso il mount aveva opzioni miste ereditate, il client riprovava per qualche secondo, poi rinunciava, e `shutil.move()` — che internamente fa `os.rename()` o copia+delete — riceveva un ritorno apparentemente ok dal kernel.

L'assunzione invisibile che ha rotto tutto: *"se il mount point è RW, allora posso scrivere ovunque dentro"*. Era razionale. Era logica. Era falsa.

Su NFS — soprattutto su appliance tipo QNAP — il mount point è RW per la root, ma le sottodirectory hanno regole proprie, ereditate da ACL server-side che il client non vede direttamente. Il filesystem non è una cosa. Sono strati, policy ereditate, assunzioni nascoste che vivono nel server e che il client scopre solo quando tenta l'operazione proibita.

## Il contrasto con la classificazione

Ricordi i quattro livelli della Parte I? Perché quel sistema convergeva pulito mentre la migrazione falliva in silenzio? Due pezzi disegnati lo stesso giorno, dalla stessa testa. Esito opposto.

La differenza non è fortuna. È una scelta architetturale, fatta o non fatta.

**La classificazione era disegnata assumendo il fallimento.** Ogni livello aveva una metrica spettro (confidence 0-1, non sì/no). Ogni fallimento di un livello attivava il successivo. Ogni decisione era loggata con timestamp, confidence, livello scelto. Un contatore real-time mostrava in qualunque istante quanti file erano stati processati e a che livello. Se qualcosa fosse andato male, i numeri l'avrebbero tradito subito.

**La migrazione era disegnata assumendo il successo.** Move riesce o no, niente spettro. Nessun fallback (se `shutil.move()` fallisce, niente piano B). Nessun feedback (nessuno verificava che il file fosse davvero nella nuova location). Nessun monitoraggio mid-flight (il processo diceva "ho mosso 2.889 file" e il database ci credeva).

Quello che manca alla migrazione è una sola cosa nel loop:

```python
shutil.move(old_path, new_path)
if not Path(new_path).exists() or Path(old_path).exists():
    raise FileNotFoundError(f"Move claimed success but file not found / still at origin")
db.update_file_location(file_id, new_path)
```

Tre righe. Quelle tre righe avrebbero rotto il ciclo al primo fallimento, mostrato l'errore reale, e mi avrebbero fatto investigare in 5 minuti invece che in 4 ore.

La classificazione presidiava i boundary **logici**: tra un livello e il prossimo, tra confidence e fallback, tra expectation e reality. La migrazione non presidiava i boundary **infrastrutturali**: tra il processo Python e il kernel, tra il codice e le policy NFS del server, tra un mount "rw" e una sottodirectory effettivamente read-only.

## Tre cose che porto a casa

**L'automazione senza feedback loop è ottimista, e l'ottimismo è fragile.**

Ogni decisione automatizzata deve avere una verifica post-azione. Non è paranoia, è onestà verso l'infrastruttura. Il prossimo tentativo di migrazione avrà la verifica dopo ogni move. Non sarà più lento in modo apprezzabile. Sarà più vero.

**I boundary infrastrutturali non sono boundary logici.**

Un mount NFS `rw` a livello kernel non è la stessa cosa di "scrivo sempre con successo". Un database aggiornato non è la stessa cosa di "il filesystem è in sync". Una ACL QNAP che dice "rw" non è la stessa cosa di "anche le sottodirectory ereditano quei permessi".

La tolleranza al fallimento deve coprire il **gap tra rappresentazione logica (DB) e realtà fisica (filesystem)**. Non sono la stessa cosa. Non lo sono mai stati. Architetturalmente: dopo il move di un batch, verifica due cose. DB: i path sono aggiornati? FS: i file esistono dove il DB dice? Se divergono, rollback del batch.

Fallback strategy se NFS fa storie: SSH diretto su QNAP, bypassare il client NFS, muovere via shell del server. Non è elegante, ma è resiliente.

**Assumere il fallimento dal design è diverso da scoprirlo in produzione.**

Costruire prima, testare dopo = fragile. Il subset di 200 file in dry-run non ha mai toccato i confini delle ACL QNAP, perché quei file finivano in directory già esistenti con permessi diversi. Il test è passato. La produzione ha fallito.

Il prossimo tentativo di migrazione sarà disegnato come la classificazione. Piano A: `shutil.move()` con verifica post. Piano B se il piano A fallisce: SSH su QNAP, move locale. Piano C se il piano B fallisce: coda di retry asincrona. Piano D se anche la coda fallisce: i path logici nel DB rimangono consistenti e posso indagare manualmente.

## Stato attuale e prossimi step

Il database è in stato parziale: 6.430 path aggiornati, filesystem invariato. È recuperabile. Niente data loss, perché i file originali sono ancora al loro posto. Il rollback è banale: `UPDATE books SET filesystem_path = original_path`.

Prossima sessione: debug profondo della NFS export policy della QNAP, remount conservativo, e se serve fallback via SSH diretto sulla QNAP per bypassare NFS. Non è finita: book-catalog arriverà a `/Bookz/{topic}/`. Ma questa volta con i feedback loop architettati da zero, con il piano di fallback deciso prima e non improvvisato dopo.

---

## Appendice tecnica

### Schema database essenziale

```
books
├─ id (INTEGER PRIMARY KEY)
├─ path (TEXT UNIQUE NOT NULL)   -- percorso filesystem
├─ filename (TEXT)
├─ title (TEXT)
├─ topics (TEXT JSON)            -- categorie calcolate in Parte I
├─ sha256 (TEXT)                 -- impronta per duplicati
├─ quality_score (REAL)
├─ scanned_at (TIMESTAMP)
└─ kb_status (TEXT)              -- stato pipeline knowledge-base

Vincoli:
- UNIQUE(path)
- WAL mode (Write-Ahead Logging) per concurrency
```

Lo schema è il contratto tra il processo Python e il filesystem. Quando `path` è aggiornato, il processo assume che il file viva al nuovo indirizzo. Nel mio fallimento il processo ha scritto la path, il filesystem ha detto "no" in silenzio, e il contratto è stato rotto.

### Architettura dei quattro livelli di classificazione (per riferimento)

```
INPUT: file.pdf
│
├─ Livello 1: LLM via proxy HTTP
│  POST /api/classify {pdf_path, model: "chat-quality"}
│  Response: {category, confidence: 0.0-1.0}
│  confidence >= 0.5 ? return : fallback livello 2
│
├─ Livello 2: PyMuPDF text extraction (prime 15 pagine)
│  text = PDF(path).get_text(page 0-14)
│  pattern match su keyword di genere
│  match ? return : fallback livello 3
│
├─ Livello 3: scikit-learn TF-IDF + LogisticRegression
│  trained su 28.578 file etichettati manualmente
│  confidence >= 0.4 ? return : fallback livello 4
│
└─ Livello 4: Ollama qwen2.5:3b in locale
   POST http://ollama:11434/api/generate
   {prompt: "Categorize this text: [extracted_text]"}
   return sempre (ultimo livello)
```

Ogni livello sa che il successivo esiste. Ogni fallimento è previsto, presidiato, alimenta una transizione. Niente è "assumed to work".

La migrazione non aveva questa struttura. Un solo tentativo, niente fallback, niente verifica.

### Timeline della migrazione

```
2026-05-17

08:00  Analisi: quale frazione di 46.878 libri risiede in non-native location?
       43.337 file in /Download/, /Mega.com/, /Deposito/

09:30  Decisione: reorganize within /Bookz/, no external delete
       Phase 1 scoped: 3.541 file vecchi in /Bookz/*/old/
       Phase 2 scoped: 2.889 file dalle tre location esterne

11:00  Phase 1 start
       ✅ 3.541 file identificati
       ✅ 3.536 DB updates committed (4 skip per encoding error)
       ✅ Filesystem untouched (as intended)

12:15  Phase 2 planning
       ✅ 2.889 file identificati
       ✅ 29 directory create in /Bookz/Uncategorized/

14:00  Phase 2 database
       ✅ 2.889 path committed in single transaction
       ✅ UNIQUE constraint OK
       ⚠️ DB ora desincronizzato (path avanti rispetto al filesystem)

14:15  Phase 2 filesystem
       ❌ 0/2.889 file moves executed
       ❌ shutil.move() reports ok, kernel says no in silenzio

15:00  Detection: filesystem verification mostra divergenza
       DB: 2.889 path aggiornate
       FS: 0 file mossi

15:15  Debug ipotesi 1: mount read-only → no
17:00  Debug ipotesi 2-4: path, ACL, NFS cache → no

17:30  Root cause: QNAP subdirectory NFS export policy
       /Bookz/ rw per autenticati
       /Bookz/Uncategorized/ inherited ro per nuove directory
       NFS protocol drops writes in silenzio, shutil.move() non raise

17:45  Interruzione: deep dive QNAP ACL + remount strategy rimandata
       Stato dati: safe (rollback triviale)
```

### Tolleranza vs fragilità — il contrasto visivo

```
CLASSIFICAZIONE                           MIGRAZIONE
─────────────────────────────────────────────────────────────────
Feedback loop      interno, real-time     assente
Fallback           4 livelli, cascata     nessuno
Verifica post      confidence, pattern    nessuna
Rollback           ogni livello salva     difficile (DB ≠ FS)
Esito              80% hit rate           0/2.889 file mossi
                   0% divergenza          100% divergenza
                   resilienza             silent failure
```

La differenza non è scala. Non è complessità. È una scelta architetturale: assumere il fallimento dal design, oppure scoprirlo in produzione.
