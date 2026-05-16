## 2024-05-18 - [getRelatedArticles O(n*m^2) Bottleneck]
**Learning:** [The existing `getRelatedArticles` function in `src/home/main.js` calculated array intersections inside a `.sort()` callback, resulting in O(n*m^2) complexity and redundant memory allocations. It was easily fixed with a single-pass scoring system before sorting.]
**Action:** [Always audit array method chaining (`.filter().sort()`) where inner loops (like `.includes()`) are used, as `.sort()` evaluates items multiple times. Pre-compute scores instead.]
