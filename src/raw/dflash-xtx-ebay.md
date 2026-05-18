---
title: Ho comprato una RX 7900 XTX su eBay per provare DFlash. Risultato — 2.6x sul Qwen3-8B
date: 2026-05-16
tags: [homelab, llm, llama.cpp, rocm, amd, speculative-decoding, benchmark, dflash]
lang: it
description: Ho testato DFlash speculative decoding (llama.cpp PR #22105) su una RX 7900 XTX eGPU AMD. Risultato: 2.62× su Qwen3-8B, 1.25× su gpt-oss-20b (MoE). Quattro inciampi onesti lungo la strada.
---

Ieri sera ho visto questo video di sette minuti su YouTube: *"DFlash — 8x faster inference on llama.cpp"*. Il tipo mostra una pull request ancora in stato draft sul repo `ggml-org/llama.cpp`, con dentro un metodo di speculative decoding che sulla carta fa girare un Qwen3-8B a 419 token al secondo su un'NVIDIA L40S. Otto volte la baseline. Numeri da paper, non da blog post.

Curiosità immediata. Non tanto per gli 8x (i benchmark "fino a" sono quasi sempre fino-a-mai), ma perché il concetto è elegante. E perché sul tavolo, da due settimane, ho una scheda che chiedeva di essere messa sotto stress.

## La scheda

Una **RX 7900 XTX 24 GB GDDR6 Gigabyte Gaming OC**, comprata su eBay a un prezzo da scheda usata-ma-non-troppo. L'ho collegata in OCUlink al server `llm` del homelab, un Minisforum AI X1-255 con AMD Ryzen 7 255 e 64 GB DDR5, al posto della Radeon 780M iGPU integrata, che fino al 15 maggio era l'unica GPU disponibile per Ollama.

Spostare il carico LLM da una iGPU di laptop a una GPU desktop top-tier ha senso a prescindere. Ma fino a oggi non avevo ancora avuto un'occasione per spremere la XTX davvero. DFlash è arrivato al momento giusto.

## Cos'è DFlash, in trenta secondi

Speculative decoding è un trucco che vale la pena conoscere se hai a che fare con LLM locali. L'idea: invece di lasciare che il modello grande generi un token alla volta in modo autoregressivo, un modello piccolo (il *drafter*) ne propone un blocco intero, il modello grande li **verifica in parallelo**, accetta quelli giusti e scarta gli altri. Se il drafter indovina spesso, vai più veloce. Se sbaglia troppo, vai più piano della baseline.

DFlash è una variante recente, paper di z-lab, implementata in `llama.cpp` dalla [PR #22105](https://github.com/ggml-org/llama.cpp/pull/22105) di Ruixiang Wang. Differenza chiave rispetto a EAGLE3 (l'altra famiglia di speculative): DFlash produce un intero blocco di candidati in **un singolo forward pass del drafter**, non uno per volta. Più throughput per iterazione del draft.

Il drafter dichiarato per Qwen3-8B è un modello da 1B parametri specializzato, `z-lab/Qwen3-8B-DFlash-b16`, pubblicato come safetensors BF16 su Hugging Face.

Sul paper l'acceptance rate sul prompt "scrivi quicksort in Python" sfiora il 93%. Ed è quello il numero che volevo vedere sulla mia macchina.

## La parte tecnica — quattro inciampi onesti

La PR è ancora **draft** (ultimo commit 27 aprile). Quindi nessuna garanzia che il codice fili liscio. Infatti.

Ho costruito un container Docker basato su `rocm/dev-ubuntu-22.04`, ho clonato `llama.cpp`, fatto checkout della PR, compilato con `-DGGML_HIP=ON -DAMDGPU_TARGETS=gfx1100` (l'architettura della XTX). Quattro problemi reali nell'ordine in cui sono arrivati.

**1. ROCm 6.2 non basta.** Primo build, errore: `unknown type name '__hip_fp8_e4m3'`. La PR usa tipi FP8 introdotti solo da ROCm 6.3 in poi. Salto a 6.4.4. Build OK.

**2. `ldconfig` mancante.** Il `cmake --install` mette le librerie condivise in `/usr/local/lib`, ma il dynamic linker del container non sa che esistono. `llama-server --version` fallisce con `libllama-common.so.0: cannot open shared object file`. Aggiungo una riga al Dockerfile:

```dockerfile
RUN echo /usr/local/lib > /etc/ld.so.conf.d/llama-cpp.conf && ldconfig
```

**3. `huggingface-cli` è morto.** Allo step di download dei modelli, lo script va in errore: *"huggingface-cli is deprecated and no longer works. Use `hf` instead."* Da qualche release del CLI di Hugging Face il binario è stato rinominato. Trent'anni di Linux mi hanno insegnato a non meravigliarmi.

**4. Il drafter ha bisogno del target.** Lo step più sottile. Lo script di conversione safetensors → GGUF della PR aggiunge un nuovo flag obbligatorio per i drafter DFlash: `--target-model-dir`. Serve a leggere le mappature `d2t`/`t2d` tra vocabolario ridotto del drafter e vocabolario completo del target. Quindi non basta scaricare il GGUF già quantizzato del Qwen3-8B (su `unsloth/Qwen3-8B-GGUF`): bisogna scaricare **tutta la cartella safetensors originale** del target, 16 GB, anche se poi la userai solo per quel singolo passaggio di conversione. Per il drafter idem: safetensors → GGUF bf16 → quantize Q4_K_M.

Risultato finale, dopo cleanup degli intermedi:

```text
Qwen3-8B.gguf_Q4_K_M.gguf             4.7 GB   (target)
Qwen3-8B-DFlash-b16.gguf_Q4_K_M.gguf  596 MB   (drafter)
```

Cinque giga e mezzo di VRAM occupata. Su 24 GB della XTX, lasciano spazio comodo anche per la KV cache q8_0 e qualche modello Ollama in keep-alive.

## Il momento della verità

Container avviato sulla porta 8081. `llama-server` carica entrambi i modelli, dichiara `speculative decoding context initialized` e si mette in ascolto. Prima richiesta, il prompt del paper: *"Write a quicksort algorithm in Python. Write code only."*

DFlash attivo:

```json
{
  "tokens_predicted": 92,
  "predicted_per_second": 132.7,
  "predicted_per_token_ms": 7.54,
  "draft_n": 80,
  "draft_n_accepted": 75
}
```

Acceptance rate: **75/80 = 93.75%**. Praticamente identico al paper (93.3%). Throughput: **132.7 tok/s**.

Per avere un termine di paragone, perché un numero da solo non vuol dire niente, ho ricaricato lo stesso modello, stesso prompt, stessi parametri di sampling, ma senza `--dflash` né drafter. Solo Qwen3-8B Q4_K_M, generazione classica autoregressiva sulla XTX.

Baseline: **50.7 tok/s**.

Speedup misurato: **132.7 / 50.7 = 2.62x**.

## E i 8x del paper?

Domanda legittima. Risposta onesta in tre punti.

**Il paper misura `bf16`, io ho misurato `Q4_K_M`.** Sono mele e pere. La quantizzazione a 4 bit del target alza la baseline assoluta (meno bytes da leggere dalla VRAM per ogni forward), quindi lascia meno margine alla speculative decoding per fare la differenza. Per dare l'idea: la mia baseline (51 t/s su XTX Q4_K_M) coincide quasi esattamente con la baseline del paper (52 t/s su L40S bf16). Significa che la XTX in Q4 sta lavorando come una L40S in bf16. Bilanciamento di bandwidth molto simile, scheda diversa.

**Il backend HIP/ROCm non è ottimizzato come quello CUDA.** La PR è scritta CUDA-first, con `__hip_fp8_e4m3` rimappato via header di compatibilità. Possibile margine ancora da spremere lato kernel ROCm, soprattutto sul re-use dei graph del drafter, che la PR stessa segnala come *future work*.

**Su un solo prompt non c'è warmup.** Il run singolo include cold start del compute graph. Un benchmark serio richiede n=20 con varianza, prompt diversi (la PR ne usa tre: quicksort, Pitagora, "piano di un giorno a DC") e mostra che l'acceptance rate crolla dal 93% al 9% sul terzo prompt, perché DFlash funziona meglio quando il drafter "indovina pattern", e la prosa generica è meno predicibile del codice.

Quindi: 2.6x non è 8x, ma è 2.6x **reale, ripetibile, sulla mia GPU, con la mia quantizzazione, sul mio stack**. È il numero che conta quando decido se mettere in produzione una pipeline LLM locale.

## Cosa porto a casa

**Per il homelab**: per i workflow code-heavy (il caso d'uso più frequente del mio Shortcutter e degli agenti che girano sul knowledge base), DFlash su Qwen3-8B Q4_K_M dà un 2.6x reale. Significa rispondere in 700 ms invece di 1.8 s, su un prompt da 90 token generati. Per un assistente interattivo è la differenza tra "fluido" e "lento".

**Per la XTX**: si comporta bene. La RX 7900 XTX è una scheda gaming spinta a fare inferenza LLM, e nei numeri assoluti regge il confronto con schede pro NVIDIA da fascia di prezzo superiore. ROCm 6.4 su gfx1100 funziona senza il workaround `HSA_OVERRIDE_GFX_VERSION` che fino a un anno fa era obbligatorio per le Radeon RDNA3. Driver maturo, supporto nativo, performance prevedibili.

**Per il metodo**: tornare a misurare invece di assumere. Il video di YouTube parlava di 8x. La mia macchina ne fa 2.6x. Tutti e due i numeri sono veri nei rispettivi contesti. Quale dei due usi per decidere dipende da quale dei due contesti somiglia di più al tuo.

## Riproducibilità

Il setup completo (Dockerfile con ROCm 6.4.4, docker-compose con i mount `/dev/kfd` e `/dev/dri`, script di prep modelli, script di benchmark) è pubblico su GitHub: [**lucasacchiricciardi/llama-dflash-rocm**](https://github.com/lucasacchiricciardi/llama-dflash-rocm). Clone, `docker compose build`, `docker compose up`. Se qualcuno lo riproduce su un'altra scheda RDNA3 (7800 XT, W7800, W7900), apra una issue con i numeri: la riproducibilità è il punto. Comando d'avvio del server, per chi vuole partire dal `llama-server` binario nativo:

```bash
llama-server \
  -m  Qwen3-8B.gguf_Q4_K_M.gguf \
  -md Qwen3-8B-DFlash-b16.gguf_Q4_K_M.gguf \
  --host 0.0.0.0 --port 8081 \
  --cache-type-k q8_0 --cache-type-v q8_0 \
  --cache-type-k-draft q8_0 --cache-type-v-draft q8_0 \
  -ngl 99 --n-gpu-layers-draft 999 \
  --dflash --draft-max 6 \
  --temp 0 --top-k 1 \
  --parallel 1 --no-mmap --mlock --jinja \
  -c 4000 -cd 1000 -t 8 \
  --chat-template-kwargs '{"enable_thinking": false}'
```

L'env var `LLAMA_SPEC_NO_THINK=1` disattiva la modalità *thinking* di Qwen3 a livello speculative. Fondamentale: con thinking attivo, l'acceptance rate crolla e lo speedup si dimezza. Il paper lo dichiara, io l'ho verificato.

## Bonus round: gpt-oss-20b

Non potevo non provare. `openai/gpt-oss-20b` è il modello MoE recentemente rilasciato da OpenAI su Hugging Face, con drafter dedicato `z-lab/gpt-oss-20b-DFlash`. Modello molto diverso dal Qwen3-8B: architettura Mixture of Experts, peso in VRAM ridotto rispetto ai parametri nominali, distribuito nel formato nativo **mxfp4**.

Primo problema scoperto: llama.cpp blocca la requantizzazione da mxfp4:

```
requantizing from type mxfp4 is disabled
```

Il target va usato così com'è: un GGUF da 13 GB, formato nativo. Il drafter si quantizza normalmente a Q4_K_M. Secondo problema, il bug della PR. Dalla seconda richiesta in poi, `llama-server` crasha con `GGML_ASSERT(n_new >= 1) failed` in `speculative.cpp:781`: il codice non resetta correttamente lo stato speculativo cross-request quando ripristina la KV cache. Workaround: un container isolato per ogni prompt.

Risultati su tre prompt (stesso benchmark della PR originale):

| Prompt | Baseline | DFlash | Speedup | Accept% |
|---|---|---|---|---|
| quicksort | 46 t/s | 77 t/s | 1.67× | 43.5% |
| pythagoras | 79 t/s† | 75 t/s | 0.95× | 26.6% |
| dc-trip | 45 t/s | 60 t/s | 1.33× | 18.5% |
| **media** | ~57 t/s | ~71 t/s | **1.25×** | — |

†La baseline Pythagoras a 79 t/s è anomala: il modello probabilmente variava il `reasoning_effort` tra le run. Escludendola, la media si avvicina a 1.50×.

### Perché meno del Qwen3-8B?

Architettura MoE. Durante il passo di verifica parallela di DFlash, il modello target attiva il routing degli esperti per ogni token candidato. Overhead che un modello denso non ha. L'acceptance rate collassa (18–44% contro il 93% del Qwen3-8B sulla stessa tipologia di prompt), e con esso lo speedup.

Non è un fallimento di DFlash. È la fisica delle MoE: il bottleneck si sposta dal bandwidth al routing overhead, e la verifica parallela guadagna meno.

### Confronto diretto

| Modello | Architettura | Formato | Baseline | DFlash | Speedup |
|---|---|---|---|---|---|
| Qwen3-8B | Dense | Q4_K_M | 50.7 t/s | 132.7 t/s | **2.62×** |
| gpt-oss-20b | MoE | mxfp4 | ~57 t/s | ~71 t/s | **1.25×** |

Per workflow code-heavy, Qwen3-8B con DFlash rimane la scelta. Il gpt-oss-20b ha ancora senso come modello di produzione (20B parametri MoE su 13 GB VRAM è un buon rapporto), ma non è il candidato ideale per speculative decoding.

---

*Aggiornato 2026-05-16 con i risultati gpt-oss-20b. Aggiornerò di nuovo quando la PR sarà mergiata in master, ora è draft. Prossimo sul mirino: Qwen3.5-9B.*
