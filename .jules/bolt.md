
## 2025-03-09 - [DOM Manipulation Optimizations]
**Learning:** Found a performance bottleneck where updating the UI required sequentially clearing DOM nodes using `removeChild()` and appending new children one by one inside loops (`forEach`). This causes layout thrashing because the browser has to recalculate styles and reflow the layout for each operation.
**Action:** Use `.textContent = ''` to clear a container, which is significantly faster. Use `DocumentFragment` to batch DOM node insertions and then append the fragment to the container once, reducing reflows and repaints to a single operation.
