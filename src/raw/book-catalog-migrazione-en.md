---
title: Why the filesystem migration failed (and what it teaches)
date: 2026-05-18
tags: [book-catalog, automation, debugging, nfs, qnap, infrastructure]
lang: en
description: 6,430 paths updated in the database, zero files moved on the filesystem. Silent failure over NFS to a QNAP. The story of a debugging session through four hypotheses and a surprise hidden in the share's ACLs.
---

**[← Read Part I: How I classified 46,878 books](./book-catalog-classificazione-en/)**

---

If classification went well, why didn't migration? Two pieces of the same project, designed on the same day, with opposite outcomes.

While the four classification levels were converging on 80%, I had another thing to deal with: reorganizing the filesystem. 43,337 files scattered across three old locations (`/Download/`, `/Mega.com/`, `/Deposito/`) had to migrate into a new structure under `/Bookz/Uncategorized/{topic}/`. Not an acrobatic task: I had the DB updated, the paths computed, filename collisions resolved with counters. On paper it all stood up.

Then something strange happened. 6,430 paths updated in the database. Zero files moved on the filesystem. Nothing. The system was carrying on as if everything was fine. Clean logs. Coherent DB. But the filesystem — the place where files actually live — was still, motionless, indifferent.

It wasn't a volume problem. It wasn't complexity. It was an invisible assumption that had broken everything. The story of how I found it — four wrong hypotheses before the right one — teaches more than the cases where things go well.

## The plan

It was a conservative plan, the kind made by someone who has shipped thousands of DevOps tasks.

**Phase 1**: identify the 3,541 files already inside `/Bookz/` with a legacy structure (directories like `BookzOld-2024/` or `Archive_backup/`). These files were already "home" but at the wrong address. Mission: update the path in the database without touching the filesystem.

**Phase 2**: identify the 43,337 files scattered across the three old locations. Create the new directory structure under `/Bookz/Uncategorized/{topic}/` before moving a single file. Then `shutil.move()` from old location to new, one by one. Then update the database. Critical ordering: tree created → files moved → DB updated. Not the other way around.

To avoid name collisions, counters. If two files were both called `philosophy-book.pdf` in different locations, the second became `philosophy-book__2.pdf`, the third `philosophy-book__3.pdf`. Simple, predictable, reversible.

All designed, all tested in dry-run on a 200-file subset. It worked.

### Why it looked solid

The database had a `UNIQUE constraint` on the `filesystem_path` column: if something went wrong with duplicate paths, the DB would refuse.

The NFS mount toward the QNAP had been remounted `rw` in the previous session, and `df -h` confirmed 2.1 TB free. The QNAP permissions were updated: the `192.168.254.0/24` subnet had read-write access on every share.

Counter logic implemented, tested, ready. All the logic in Python, committed to git, clean dry-run.

On paper it was the plan of someone who knows what they're doing.

### The execution

**Phase 1**: 3,536 INSERT/UPDATE committed (4 skipped for encoding errors). ✅
**Phase 2 planning**: 2,889 files identified in the three old locations. Target directories created under `/Bookz/Uncategorized/`. 29 topic directories. ✅
**Phase 2 database**: 2,889 path transformations computed and committed in a single transaction. UNIQUE constraint verified, no duplicates. ✅
**Phase 2 filesystem**: 0/2,889 files moved. ❌

The code was this:

```python
for file_id, old_path, new_path in migration_list:
    try:
        shutil.move(old_path, new_path)
        db.update_file_location(file_id, new_path)
    except Exception as e:
        logger.error(f"Move failed for {file_id}: {e}")
```

No exception raised. No error in the log. The loop terminated normally. When I went to check the filesystem with `ls -la /Bookz/Uncategorized/` — nothing. Zero files.

The database says they're there. The filesystem says the opposite.

Silent failure. The enemy of automated systems. It isn't a dramatic crash where everything breaks and you know immediately. It's worse: the system trusts you, the log says "all ok", the process terminates, and when you go to check reality physically nothing is there. It's like writing to `/dev/null`: the process continues, the pipe stays open, the output signal returns "written", but the data vanishes into the void.

## Four hypotheses before the truth

When you discover that 2,889 files were supposed to move and 0 were touched, the first instinct is to look for the obvious error. Uncaught exception? Permissions? Read-only mount? Four leads, four dead ends before the revelation.

### Hypothesis 1: the mount is still read-only

First instinct: the remount toward the QNAP didn't take effect. Maybe `mount -o rw,remount /mnt/qnap-nfs` didn't actually run, maybe the kernel still thinks the mount is `ro`.

Check:
```
$ df -h /mnt/qnap-nfs
Filesystem                  Size  Used Avail Use% Mounted on
192.168.254.150:/Bookz     10.0T  3.5T  6.5T  35% /mnt/qnap-nfs
Type: nfs4
Options: rw,noatime,vers=4.1,...
```

Mount is `rw`. Explicit test: `touch /mnt/qnap-nfs/test-write`. The file gets created. `cat` works. The kernel considers the mount readable-writable.

It's not the mount.

### Hypothesis 2: it's the paths

Second instinct: maybe the old files aren't found. `os.path.exists()` says the file doesn't exist, and `shutil.move()` fails silently.

Check on all 2,889 pairs:
```python
from pathlib import Path
for old in sample_paths:
    assert Path(old).exists(), f"FAIL: {old}"
    assert Path(old).is_file(), f"Not a file: {old}"
```

All green. 2,889/2,889 files exist, Python sees them, they're accessible.

It's not path resolution.

### Hypothesis 3: it's the QNAP ACLs

Third instinct: maybe the NFS share is restrictive. Reads pass, but writes are blocked at the server.

QNAP ACL audit via web UI (`192.168.254.150:8080` → Storage Manager → NFS Access Rights). The `192.168.254.0/24` subnet has read, write and execute all `allowed`.

To be safe, SSH directly into the QNAP:
```bash
touch /Bookz/Uncategorized/test-qnap.txt
echo "hello" > /Bookz/Uncategorized/test-qnap.txt
mv /Bookz/Uncategorized/test-qnap.txt /Bookz/Uncategorized/test-moved.txt
ls -la /Bookz/Uncategorized/test-moved.txt
```

All green. From the QNAP side writes work perfectly.

It's not the QNAP ACLs (at least not those).

### Hypothesis 4: the NFS kernel is caching metadata

Fourth instinct, the most sophisticated one. NFS can cache metadata. The kernel believes the file is there, but when the client actually tries to write — the atomic move — the NFS server says no, and the client instead of raising an exception returns silently.

It happens rarely, but with NFS it isn't impossible. Stale inode cache, cached ACLs, or a `soft` client that after N retries "gives up" without notifying the process.

Unmount and remount with explicit options:
```bash
sudo umount /mnt/qnap-nfs
sudo mount -t nfs4 \
  -o noatime,nocto,soft,timeo=10,retrans=2 \
  192.168.254.150:/Bookz /mnt/qnap-nfs
```

Retry the migration: 0/2,889. Nothing.

Second attempt, opposite options:
```bash
sudo mount -t nfs4 \
  -o atime,cto,hard,timeo=600,retrans=3 \
  192.168.254.150:/Bookz /mnt/qnap-nfs
```

Retry: 0/2,889. Still nothing.

It's not NFS cache. It's deeper.

### The moment I got it

While running the test again I notice a detail. The directories created under `/Bookz/Uncategorized/` exist (`ls -la` shows them), but when I try to create a file inside **from the Linux client** (not from QNAP SSH):

```bash
touch /mnt/qnap-nfs/Uncategorized/fantasy/test-client.txt
```

The command ends without error. But `ls -la` after: nothing.

There it is. It isn't the whole mount that's read-only. It's one level below. `/Bookz/` is RW (directories get created), but `/Bookz/Uncategorized/` has something different.

SSH into the QNAP, I check the local ACLs of the folder:
```bash
$ ls -lda /Bookz/Uncategorized/
drwxr-xr-x  31 admin root  4096 May 17 12:15 /Bookz/Uncategorized
$ stat /Bookz/Uncategorized/
  Access: (0755)
  Uid: ( 1000/admin)  Gid: (   32/root)
  NFS Export: /Bookz (ro for guest, rw for authenticated)
```

The directory is 775 on the local filesystem, but the `/Bookz/` NFS export has a differentiated policy: the root is RW for authenticated clients, **but subdirectories created after mount inherit a conservative default that isn't**. The folder is readable from the client (that's why `ls` works), but writes are blocked at the NFS protocol level.

At the kernel level the NFS server replies with `NFSERR_ACCES` (or similar), but `shutil.move()` doesn't catch that return as an exception. The move "returns ok", the file stays where it was, the process continues.

Why the silent failure? The NFS kernel, when it receives a rejection from the server, has two behaviors:
1. If the mount is `hard` (the historical default), the client retries forever and the process blocks.
2. If the mount is `soft`, after N retries the client gives up silently and returns control to the process, not always raising an exception.

In my case the mount had inherited mixed options, the client retried for a few seconds, then gave up, and `shutil.move()` — which internally does `os.rename()` or copy+delete — received an apparently-ok return from the kernel.

The invisible assumption that broke everything: *"if the mount point is RW, then I can write anywhere inside it"*. Rational. Logical. False.

On NFS — especially on appliances like QNAP — the mount point is RW for the root, but subdirectories have their own rules, inherited from server-side ACLs the client doesn't see directly. The filesystem isn't one thing. It's layers, inherited policies, hidden assumptions that live on the server and the client discovers them only when it tries the forbidden operation.

## The contrast with classification

Remember the four levels from Part I? Why did that system converge cleanly while the migration failed silently? Two pieces designed the same day, from the same head. Opposite outcomes.

The difference isn't luck. It's an architectural choice, made or not made.

**Classification was designed assuming failure.** Each level had a spectrum metric (confidence 0-1, not yes/no). Each level's failure activated the next. Each decision was logged with timestamp, confidence, chosen level. A real-time counter showed at any moment how many files had been processed and at which level. If something had gone wrong, the numbers would have betrayed it immediately.

**The migration was designed assuming success.** Move either works or it doesn't, no spectrum. No fallback (if `shutil.move()` fails, no Plan B). No feedback (nobody verified the file was actually in the new location). No mid-flight monitoring (the process said "I moved 2,889 files" and the database believed it).

What's missing from the migration is one thing inside the loop:

```python
shutil.move(old_path, new_path)
if not Path(new_path).exists() or Path(old_path).exists():
    raise FileNotFoundError(f"Move claimed success but file not found / still at origin")
db.update_file_location(file_id, new_path)
```

Three lines. Those three lines would have broken the loop at the first failure, shown the real error, and let me investigate in 5 minutes instead of 4 hours.

Classification guarded the **logical** boundaries: between one level and the next, between confidence and fallback, between expectation and reality. The migration didn't guard the **infrastructural** boundaries: between the Python process and the kernel, between the code and the server's NFS policies, between an "rw" mount and a subdirectory that's effectively read-only.

## Three things I take home

**Automation without feedback loops is optimistic, and optimism is fragile.**

Every automated decision needs a post-action check. It isn't paranoia, it's honesty toward the infrastructure. The next migration attempt will have the check after every move. It won't be noticeably slower. It will be truer.

**Infrastructural boundaries aren't logical boundaries.**

An `rw` NFS mount at the kernel level isn't the same as "I always write successfully". An updated database isn't the same as "the filesystem is in sync". A QNAP ACL saying "rw" isn't the same as "subdirectories inherit those permissions".

Failure tolerance must cover the **gap between logical representation (DB) and physical reality (filesystem)**. They aren't the same thing. They never were. Architecturally: after the move of a batch, verify two things. DB: are the paths updated? FS: are the files where the DB says? If they diverge, batch rollback.

Fallback strategy if NFS misbehaves: SSH directly into the QNAP, bypass the NFS client, move via the server's shell. Not elegant, but resilient.

**Assuming failure from the design is different from discovering it in production.**

Build first, test later = fragile. The 200-file dry-run subset never touched the QNAP ACL boundaries, because those files ended up in already-existing directories with different permissions. The test passed. Production failed.

The next migration attempt will be designed like classification. Plan A: `shutil.move()` with post-verification. Plan B if Plan A fails: SSH into QNAP, local move. Plan C if Plan B fails: async retry queue. Plan D if even the queue fails: logical paths in the DB remain consistent and I can investigate manually.

## Current state and next steps

The database is in a partial state: 6,430 paths updated, filesystem unchanged. It's recoverable. No data loss, because the original files are still in their original places. Rollback is trivial: `UPDATE books SET filesystem_path = original_path`.

Next session: deep dive into the QNAP NFS export policy, conservative remount, and if needed fallback via SSH directly on the QNAP to bypass NFS. It isn't over: book-catalog will reach `/Bookz/{topic}/`. But this time with feedback loops architected from the start, with a fallback plan decided before, not improvised after.

---

## Technical appendix

### Essential database schema

```
books
├─ id (INTEGER PRIMARY KEY)
├─ path (TEXT UNIQUE NOT NULL)   -- filesystem path
├─ filename (TEXT)
├─ title (TEXT)
├─ topics (TEXT JSON)            -- categories computed in Part I
├─ sha256 (TEXT)                 -- fingerprint for duplicates
├─ quality_score (REAL)
├─ scanned_at (TIMESTAMP)
└─ kb_status (TEXT)              -- knowledge-base pipeline status

Constraints:
- UNIQUE(path)
- WAL mode (Write-Ahead Logging) for concurrency
```

The schema is the contract between the Python process and the filesystem. When `path` is updated, the process assumes the file lives at the new address. In my failure the process wrote the path, the filesystem said "no" silently, and the contract broke.

### Architecture of the four classification levels (for reference)

```
INPUT: file.pdf
│
├─ Level 1: LLM via HTTP proxy
│  POST /api/classify {pdf_path, model: "chat-quality"}
│  Response: {category, confidence: 0.0-1.0}
│  confidence >= 0.5 ? return : fallback level 2
│
├─ Level 2: PyMuPDF text extraction (first 15 pages)
│  text = PDF(path).get_text(page 0-14)
│  pattern match on genre keywords
│  match ? return : fallback level 3
│
├─ Level 3: scikit-learn TF-IDF + LogisticRegression
│  trained on 28,578 manually labeled files
│  confidence >= 0.4 ? return : fallback level 4
│
└─ Level 4: Ollama qwen2.5:3b locally
   POST http://ollama:11434/api/generate
   {prompt: "Categorize this text: [extracted_text]"}
   always returns (last level)
```

Each level knows the next one exists. Each failure is anticipated, guarded, feeds a transition. Nothing is "assumed to work".

The migration didn't have this structure. One attempt, no fallback, no verification.

### Migration timeline

```
2026-05-17

08:00  Analysis: what fraction of 46,878 books lives in non-native locations?
       43,337 files in /Download/, /Mega.com/, /Deposito/

09:30  Decision: reorganize within /Bookz/, no external delete
       Phase 1 scoped: 3,541 old files under /Bookz/*/old/
       Phase 2 scoped: 2,889 files from the three external locations

11:00  Phase 1 start
       ✅ 3,541 files identified
       ✅ 3,536 DB updates committed (4 skipped for encoding errors)
       ✅ Filesystem untouched (as intended)

12:15  Phase 2 planning
       ✅ 2,889 files identified
       ✅ 29 directories created under /Bookz/Uncategorized/

14:00  Phase 2 database
       ✅ 2,889 paths committed in a single transaction
       ✅ UNIQUE constraint OK
       ⚠️ DB now desynchronized (paths ahead of the filesystem)

14:15  Phase 2 filesystem
       ❌ 0/2,889 file moves executed
       ❌ shutil.move() reports ok, kernel says no silently

15:00  Detection: filesystem verification shows divergence
       DB: 2,889 paths updated
       FS: 0 files moved

15:15  Debug hypothesis 1: read-only mount → no
17:00  Debug hypotheses 2-4: paths, ACL, NFS cache → no

17:30  Root cause: QNAP subdirectory NFS export policy
       /Bookz/ rw for authenticated clients
       /Bookz/Uncategorized/ inherited ro for new directories
       NFS protocol drops writes silently, shutil.move() doesn't raise

17:45  Interruption: deep dive QNAP ACL + remount strategy deferred
       Data state: safe (trivial rollback)
```

### Tolerance vs fragility — the visual contrast

```
CLASSIFICATION                            MIGRATION
─────────────────────────────────────────────────────────────────
Feedback loop      internal, real-time    absent
Fallback           4 levels, cascade      none
Post-verification  confidence, pattern    none
Rollback           every level saves      hard (DB ≠ FS)
Outcome            80% hit rate           0/2,889 files moved
                   0% divergence          100% divergence
                   resilience             silent failure
```

The difference isn't scale. It isn't complexity. It's an architectural choice: assume failure from the design, or discover it in production.
