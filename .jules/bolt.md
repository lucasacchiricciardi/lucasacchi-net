## 2024-05-18 - [Batching DOM insertions with DocumentFragment]
**Learning:** For rendering large lists of articles, individually appending children directly into the live DOM causes multiple layout reflows, which is an inefficient DOM manipulation pattern. Additionally, clearing child nodes iteratively is slower than simply assigning empty string to textContent.
**Action:** Use `document.createDocumentFragment()` to batch DOM node insertions and only append the fragment once. Use `textContent = ""` to quickly clear child nodes.
