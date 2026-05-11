## 2024-02-12 - [Redundant array iterations during filter/sort]
**Learning:** `Array.prototype.sort()` callbacks execute $O(N \log N)$ times, making any complex or O(n) calculations (like array mapping or filtering) inside the `sort` callback disastrous for performance.
**Action:** When filtering or sorting data with heavy comparisons or lookups, always apply a Schwartzian transform (map to cache values, sort the objects by cached values, map back) to ensure lookups occur exactly $O(N)$ times.
