## 2024-05-17 - Array sort comparator overhead
**Learning:** Found an $O(N \log N \times M \times T)$ time complexity sorting logic in `getRelatedArticles` because tag matching using `.filter(t => currentTags.includes(t))` was happening inside the `.sort` comparator multiple times.
**Action:** Always pre-calculate match scores (and ideally convert properties to $O(1)$ lookups via object map or Set) *before* sorting rather than recalculating expensive intersection sets during `.sort`.
