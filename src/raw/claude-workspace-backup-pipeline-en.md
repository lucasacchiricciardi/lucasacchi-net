---
title: How I hardened my Claude Code workspace — a backup pipeline in 5 steps
date: 2026-05-02
tags: [backup, sysadmin, docker, syncthing, qnap, disaster-recovery, wsl2]
lang: en
---

I use Claude Code CLI every day. My workspace lives on WSL2 and holds code, documentation, course notes, context files for my projects. If the disk dies tomorrow, I lose months of work.

I didn't want to think about it. So I built an automatic backup pipeline: from my laptop to the NAS, through a Docker VM. One-minute RPO, zero manual intervention.

Here's how.

### The architecture

Three stages, simple:

1. **Production**: WSL2 on my laptop
2. **Staging**: Docker VM (`dockerhost02`)
3. **Cold storage**: QNAP NAS in RAID

Everything starts with Syncthing, goes through rsync over SSH, ends up in a deduplicated backup. Let's walk through the steps.

### Step 1: Real-time sync with Syncthing

Syncthing monitors the workspace folder on WSL2 and replicates it on the VM inside a dedicated Docker container.

First check after deploy: `ls -la` on the Docker volume. Files present, permissions correct (`abc:users`), Git metadata intact. Sub-second sync. Done.

### Step 2: Passwordless SSH to the QNAP

This is where I lost some time. QNAPs don't use the standard path for authorized SSH keys. It's not `~/.ssh/authorized_keys`, but `/etc/config/ssh/authorized_keys`.

Generated an ED25519 key on the VM, injected the public key into the NAS, ran a connection test. But the connection test failed for a trivial reason:

```bash
ssh admin@192.168.254.100 "echo 'Connection successful!'"
```

Bash interprets the `!` as history expansion. A single character that cost me 10 minutes. Fix: single quotes around the string. Never underestimate special characters.

### Step 3: rsync + flock for per-minute sync

The script does one thing: rsync from the VM to the NAS every 60 seconds via crontab.

But there's a problem: if a sync takes more than a minute, the next process starts on top and they overlap. Both writing to the same files. Not a good idea.

Solution: `flock`. A lock file at `/tmp/qnap_sync.lock`. If a sync is already running, the next one waits politely for its turn.

```bash
(
  flock -n 200 || exit 1
  rsync -avz -e "ssh -i /root/.ssh/id_rsa_qnap" \
    "/var/lib/docker/volumes/syncthing_data/_data/Claude/" \
    "admin@192.168.254.100:/share/CACHEDEV3_DATA/BackupClaude/"
) 200>"/tmp/qnap_sync.lock"
```

### Step 4: Logrotate so you don't drown in logs

A per-minute sync generates logs at an impressive rate. In a few hours the file was already at 1.2MB.

I set up logrotate: daily rotation, 10MB cap, 7 compressed copies, `0640` permissions. Verified with `logrotate -f` that the new log file had the correct permissions. Because wrong logs help no one.

### Step 5: The safety belt — deduplication on NAS

Last layer: HBS 3 (Hybrid Backup Sync) on the QNAP. A job that takes the backup data and moves it to a separate volume, in `.qdff` format with deduplication.

This gives me a "time machine": if I accidentally delete a file today, I recover it from yesterday's version. If ransomware encrypts everything, I have a clean snapshot on a different volume.

### The result

Every line of code replicates to the VM in **1 second**.
Every change reaches the NAS within **60 seconds**.
A deduplicated history exists for recovering previous versions.
The entire system maintains itself.

Three rules that guided the whole build:

- **Safety first** — flock to prevent parallel runs, verified permissions, ED25519 keys
- **Little often** — sync every minute, not every hour
- **Double check** — forced logrotate to verify permissions, `.qdff` integrity to check monthly

Stack: WSL2, Docker, Syncthing, rsync, SSH (ED25519), crontab, logrotate, QNAP HBS 3. No cloud, no recurring costs.

---

Anyone running similar backup pipelines for their dev workspaces? Let me know in the comments.
