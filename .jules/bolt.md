## 2024-05-14 - [O(N log N * M) arrays filtering optimized]
**Learning:** Found a performance bottleneck where related articles generation used nested `.filter()` inside a `.sort()` callback. This meant for every article comparison, it iterated over the arrays repeatedly leading to poor performance, especially as the number of articles grows.
**Action:** Always extract O(N) operations out of sort callbacks (which run O(N log N) times) and pre-calculate scores in a single pass whenever sorting depends on complex dynamic metrics like array intersections.
