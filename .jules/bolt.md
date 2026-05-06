## 2025-02-23 - DOM Node Creation
**Learning:** `createArticleElement` in `main.js` currently uses `document.createElement` extensively, creating a full DOM tree for each article individually before appending it, and using a loop without a DocumentFragment in `renderPage`.
**Action:** Use a `DocumentFragment` when rendering multiple articles in `renderPage` to minimize DOM reflows.
