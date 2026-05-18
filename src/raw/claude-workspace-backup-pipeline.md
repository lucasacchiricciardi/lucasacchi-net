---
title: Come ho blindato il mio workspace Claude Code — pipeline di backup in 5 step
date: 2026-05-02
tags: [backup, sysadmin, docker, syncthing, qnap, disaster-recovery, wsl2]
lang: it
description: Pipeline di backup automatica dal laptop al NAS passando per una VM Docker. WSL2 → Syncthing → rsync via SSH → QNAP. RPO di un minuto, zero intervento manuale.
---

Uso Claude Code CLI tutti i giorni. Il mio workspace vive su WSL2 e contiene codice, documentazione, appunti di corso, context file per i progetti. Se domani il disco muore, perdo mesi di lavoro.

Non mi andava di pensarci. Così ho costruito una pipeline di backup automatica: dal laptop al NAS, passando per una VM Docker. RPO di un minuto, zero intervento manuale.

Ecco come.

### L'architettura

Tre stadi, semplice:

1. **Produzione**: WSL2 sul mio laptop
2. **Staging**: VM Docker (`dockerhost02`)
3. **Cold storage**: QNAP NAS in RAID

Tutto parte da Syncthing, arriva a rsync via SSH, finisce in un backup deduplicato. Vediamo i passaggi.

### Step 1: Sincronizzazione real-time con Syncthing

Syncthing monitora la cartella del workspace su WSL2 e la replica sulla VM in un container Docker dedicato.

Primo controllo dopo il deploy: `ls -la` sul volume Docker. File presenti, permessi corretti (`abc:users`), metadati di Git intatti. Sincronizzazione sotto il secondo. Fatto.

### Step 2: SSH passwordless verso il QNAP

Qui ho perso un po' di tempo. I QNAP non usano il path standard per le chiavi SSH autorizzate. Non è `~/.ssh/authorized_keys`, ma `/etc/config/ssh/authorized_keys`.

Chiave ED25519 generata sulla VM, pubblica iniettata nel NAS, test di connessione. Il test però è fallito per un motivo banale:

```bash
ssh admin@192.168.254.100 "echo 'Connessione riuscita!'"
```

La Bash interpreta il `!` come history expansion. Un carattere che mi ha fatto perdere 10 minuti. Soluzione: virgolette singole intorno alla stringa. Mai sottovalutare i caratteri speciali.

### Step 3: rsync + flock per lo sync al minuto

Lo script fa una cosa sola: rsync dalla VM al NAS ogni 60 secondi tramite crontab.

C'è però un problema: se un sync impiega più di un minuto, il processo successivo parte sopra e si sovrappongono. Entrambi scrivono sugli stessi file. Non è una bella idea.

Soluzione: `flock`. Un file di lock a `/tmp/qnap_sync.lock`. Se un sync è già in corso, il successivo aspetta educatamente il suo turno.

```bash
(
  flock -n 200 || exit 1
  rsync -avz -e "ssh -i /root/.ssh/id_rsa_qnap" \
    "/var/lib/docker/volumes/syncthing_data/_data/Claude/" \
    "admin@192.168.254.100:/share/CACHEDEV3_DATA/BackupClaude/"
) 200>"/tmp/qnap_sync.lock"
```

### Step 4: Logrotate per non annegare nei log

Uno sync al minuto genera log a velocità impressionante. In poche ore il file era già a 1.2MB.

Ho configurato logrotate: rotazione giornaliera, limite di 10MB, 7 copie compresse, permessi `0640`. Verificato con `logrotate -f` che il nuovo file log avesse i permessi corretti. Perché i log sbagliati non servono a nessuno.

### Step 5: La cintura di sicurezza — deduplicazione su NAS

Ultimo strato: HBS 3 (Hybrid Backup Sync) sul QNAP. Un job che prende i dati dalla cartella di backup e li sposta su un volume separato, in formato `.qdff` con deduplicazione.

Questo mi dà una "macchina del tempo": se cancello un file per sbaglio oggi, lo recupero dalla versione di ieri. Se un ransomware mi cripta tutto, ho uno snapshot pulito su un volume diverso.

### Il risultato

Ogni riga di codice si replica sulla VM in **1 secondo**.
Ogni cambiamento finisce sul NAS entro **60 secondi**.
Esiste uno storico deduplicato per il recupero di versioni precedenti.
L'intero sistema si mantiene da solo.

Tre regole che hanno guidato tutto il lavoro:

- **Safety first**: flock per evitare corse parallele, permessi verificati, chiavi ED25519
- **Little often**: sync ogni minuto, non ogni ora
- **Double check**: logrotate forzato per verificare i permessi, integrità del file `.qdff` da controllare mensilmente

Stack: WSL2, Docker, Syncthing, rsync, SSH (ED25519), crontab, logrotate, QNAP HBS 3. Niente cloud, niente costi ricorrenti.

---

Qualcuno ha pipeline di backup simili per i propri workspace di sviluppo? Scrivimi nei commenti.
