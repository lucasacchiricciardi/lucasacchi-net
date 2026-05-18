---
title: How I classified 46,878 books — the four levels that converge
date: 2026-05-18
tags: [book-catalog, architecture, automation, llm, homelab]
lang: en
description: LLM hit rate stuck at 61%, taxonomy exploded from 29 to 155 categories. Four specialized fallback levels to reach 80% without pulling out a bigger model.
---

One morning in May I'm looking at the book-catalog dashboard and something's off. 46,878 books in the queue, LLM hit rate stuck at 61%, taxonomy exploded from 29 starting categories to 155 proposed by the system. Not a disaster: a plateau. The model classifies what it knows well and ignores the rest.

That's the moment when you realize the problem isn't the model. It's the architecture.

What follows is how I turned that plateau into a cascade of four specialized fallbacks: each one does its part up to a point, then hands off to the next. It's not a story about bigger models or smarter training sets. It's a story about what happens when you stop asking a single tool to do everything.

## The LLM plateau

For the first two months I used an LLM via proxy to classify the books. Sensible call: acceptable latency (300-500 ms per request), broad coverage, and the model knows the entire world, not just my domain of 46,000 books.

61% hit rate over the whole population. Generic categories (fantasy, mystery, science fiction) and recognizable titles (Harry Potter, Dune, 1984) drop into the right bucket without effort. The remaining 39% is where the problem shows up: the model starts guessing badly, often fails silently or dumps the book into a generic fallback category that makes search useless.

At this point you have two roads. First: try a bigger model. Most obvious move, also the most expensive. Second: add a Plan B that doesn't try to be "smarter", but looks at the context from a different angle.

I picked the second.

## Level 2 — PyMuPDF and the document's own patterns

When the LLM confidence drops below 0.5, or the predicted category doesn't exist in the taxonomy, I move to level 2: I open the PDF.

I extract the first 15 pages with PyMuPDF and look for text patterns. Tables of contents, indexes, repeated keywords, genre declarations written by the document itself. The book often tells you what it is without needing an LLM to interpret: you just have to read it in the language of structure.

Result: 68% of the LLM failures get resolved here. A technical manual has a "Contents" section saying "Chapter 3: Networking". An academic biography has a "Curator's preface". A romance has scenes recognizable from keywords. It's not magic, the document already did the self-description work.

Cost: 200-400 ms for extraction and matching. From 61% hit rate I jump to 75%.

## Level 3 — scikit-learn and the training set's memory

What if the PDF is corrupted? What if the first 15 pages are blank? What if OCR fails on a bad scan?

Level 3 enters: a scikit-learn classifier trained on 28,578 files already manually labeled in previous sessions. Nothing sophisticated: TF-IDF + logistic regression on tokens from title, author and metadata. Test set accuracy: 62%.

Sounds low, and in absolute terms it is. But the model isn't trying to understand the world: it's trying to understand *my* specific domain of 46,000 books. It has seen hybrid categories, minor authors, anomalous taxonomies that an LLM never encounters. 62% is probably the rational upper bound for a domain where the rest of the patterns is human noise.

When the score drops below 0.5, the model doesn't try to guess. It hands off to the next level.

From 75% I move to 79%.

## Level 4 — local Ollama as the confessional

21% remains. Files where the LLM caved, PyMuPDF found no patterns, scikit-learn guessed below confidence. Last attempt before giving up.

Here I use `qwen2.5:3b`, a small model running on Ollama locally (zero extra latency, zero API calls). It isn't "the final smart model". It's the confessional: the system arrives with three previous failures annotated and asks a small model to try with what's left.

What I noticed is that when the small model receives the context of the three previous failures, the answers become surprisingly good. Not because it's a smart model, but because it knows it's working at the margins and makes more cautious choices.

Final hit rate on the validation batch: 80%.

## What each level does

To recap:

- **Level 1 (LLM via proxy)**: classifies what's universal. Caves below confidence 0.5.
- **Level 2 (PyMuPDF)**: reads the document. Caves when the file is corrupted or has no useful patterns.
- **Level 3 (local scikit-learn)**: uses the specific training set memory. Caves when domain patterns collide.
- **Level 4 (Ollama qwen2.5:3b)**: last attempt with the context of all failures. Always returns something.

None of them try to win everything. Each does what it knows, and when it steps outside its domain it hands off to the next. It isn't redundancy (I'm not doing the same work four times). It's four different specialists passing the baton based on a confidence signal.

The important detail is that each level passes to the next not just its output but also its uncertainty. Level 4 knows the other three caved. That knowledge is what makes it change strategy.

## The metrics

On May 16 I launch a validation batch on 10,000 random books. The LLM alone does 61% hit rate. Those are the numbers that had frustrated me for weeks: not bad, but unable to climb further.

Then I switch on level 2. Hit rate goes to 75%. It's not just a +14% number: it's a different question being asked of the same dataset. The 1,400 books the LLM hadn't understood, 68% of them speak the language of document structure.

I switch on level 3. Hit rate goes to 79%. +4%, and here it's internal resonance: the classifier isn't discovering new patterns, it's confirming and refining what the previous levels proposed, with the memory of the training set.

I switch on level 4. Final hit rate: 80%. +1% that looks small, but it represents 20% of the previous failures — cases where the other three levels had nothing solid to lean on.

With this framework the initial batch of 10,000 books has been fully processed. Batch 2 of 20,000 books was launched autonomously, without supervision. Total classified: 30,000 out of 46,878 (64% coverage).

In parallel the taxonomy expanded. From the 29 initial categories (rigid, institutional) I got to 155 categories proposed by the system. Of these: 84 Italian-native (essays, Italian literature, local specialist), 71 international. Not a single slug came from a decision of mine. They all emerged from the natural recursion of the four levels, batch after batch.

### What these numbers actually mean

The 80% hit rate isn't perfection. Manual audit on 30 random books: 24 correct, 6 in ambiguous margins but still categorizable (a fantasy tagged as "anthropological-fantasy" instead of pure, a geopolitical thriller instead of generic). These aren't chaotic errors. They're failures the next batch already knows how to handle: unforeseen categories, corrupted PDFs, titles in poorly represented languages.

80% wasn't the goal of the design. I didn't say "I want 80%, so I build four levels". I said "I want a system where every component knows when it doesn't know". And 80% emerged as a consequence.

If I had aimed only at the number, I would have added VRAM to the LLM, doubled the budget, hacked the first level to the bone. I would probably have reached 70-72% and stopped.

## Three things I take home

**Robust automation isn't "smarter". It's more self-aware.**

Level 1's LLM doesn't become smarter when I combine it with PyMuPDF. But the system as a whole becomes aware of its own limits, because each level passes to the next both the output and the confidence score. That metainformation is all you need.

Robustness doesn't live in a single model. It lives in the architecture around it. It isn't a question of *which* model you use: it's a question of *how* the models talk to each other when they fail.

**The metric comes after, it doesn't drive the design.**

I count 80% hit rate, but the number arrives *after* the system has been built. If I hadn't had the fallback structure, I couldn't even count the LLM's 61% as a starting point: I could only complain that "something doesn't work, but I don't know what".

Numbers become visible only when the system is transparent about where it fails. Want to replicate this result in a project of your own? Don't start from a target number. Start from the question: "How do I know when the system failed, and at which level?". Answer that well and the metric arrives on its own.

**Failure tolerance is the foundation, not a late addition.**

In "agile" culture failure tolerance is often the thing you add *later*, if you have time. "We have the core, we'll add graceful degradation in v2". Here I did the opposite. Each level exists because the previous one *could* fail. Not from pessimism, but because in production chaos is guaranteed.

Concrete consequence: when I launch batch 3, I won't go in blind. I know the marginal 20% of batch-to-batch failures will cluster around corrupted PDFs, new categories, titles in non-Latin scripts. I architected success and predictable fallibility at the same time.

---

That said: on the same day the classification was converging cleanly toward 80%, another piece of the project was failing silently. Same architectural thinking required, opposite decision, different consequences.

**[Read Part II: Why the filesystem migration failed (and what it teaches)](/blog/book-catalog-migrazione-en/)**
