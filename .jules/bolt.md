## 2024-05-01 - [Debounce Search Input]
**Learning:** In a vanilla JS application, rapid DOM mutations caused by 'input' events on text fields can block the main thread and impact perceived performance if not throttled or debounced. The `setupSearch` listener in `src/home/main.js` was previously filtering and re-rendering articles synchronously on every keystroke.
**Action:** Always check high-frequency event listeners (like `'input'`, `'scroll'`, `'resize'`) for synchronous heavy operations, and apply debouncing or throttling.
