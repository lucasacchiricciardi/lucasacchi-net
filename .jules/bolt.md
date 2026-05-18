## 2024-03-21 - [Array Sorting Optimization]
**Learning:** Calculating heavy metrics like tag intersections inside the array `.sort()` comparator loop leads to O(n²) performance degradation.
**Action:** Use the Schwartzian transform pattern: pre-calculate expensive metrics during a single O(n) pass (e.g., mapping to an object with the pre-calculated value), sort based on this value, and then map back to the original format.
