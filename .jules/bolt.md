## 2024-05-14 - [Search text bottleneck]
**Learning:** In applications where articles are stored in memory with their full text (e.g., Markdown content), performing `.toLowerCase()` on the entire content block for each article on every keystroke during a search causes O(N*M) string allocations. This is a severe, codebase-specific performance anti-pattern.
**Action:** Implement lazy initialization to memoize searchable text, ensuring the heavy string operations are only performed once per article.
