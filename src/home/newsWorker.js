// Base URL for fetching news - will be set by main thread via 'setBaseUrl' message
// Default to empty string (works for both root and subdirectory deployments)
let BASE_URL = '';
let FETCH_URL = BASE_URL + '/news/news-feed.json';
let VERSION_URL = BASE_URL + '/news/version.txt';
const POLL_INTERVAL = 3600000; // 1 hour

let lastHash = null;
let lastVersion = null;
let consecutiveErrors = 0;
let pollTimeout;

function scheduleNextPoll(interval) {
  pollTimeout = setTimeout(fetchNews, interval);
}

async function computeHash(data) {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function fetchVersion() {
  try {
    const versionResponse = await fetch(VERSION_URL);
    if (!versionResponse.ok) return null;
    return (await versionResponse.text()).trim();
  } catch {
    return null;
  }
}

async function fetchNews() {
  try {
    // Fetch version for version checking
    const remoteVersion = await fetchVersion();
    
    // Fetch news feed
    const newsResponse = await fetch(FETCH_URL);

    if (!newsResponse.ok) {
      self.postMessage({ type: 'error', message: `HTTP ${newsResponse.status}: ${newsResponse.statusText}` });
      consecutiveErrors++;
      let nextInterval = POLL_INTERVAL;
      if (consecutiveErrors >= 3) nextInterval = 30000;
      if (consecutiveErrors >= 6) nextInterval = 60000;
      scheduleNextPoll(nextInterval);
      return;
    }

    const data = await newsResponse.text();
    const hash = await computeHash(data);

    // Check version mismatch - invalidate cache if version changed
    if (remoteVersion && lastVersion && remoteVersion !== lastVersion) {
      // Version changed - clear cache by forcing a fetch
      lastHash = null;
      self.postMessage({ type: 'version-mismatch', oldVersion: lastVersion, newVersion: remoteVersion });
    }
    
    // Update stored version
    if (remoteVersion) {
      lastVersion = remoteVersion;
    }

    // Skip if content unchanged
    if (hash === lastHash) {
      self.postMessage({ type: 'unchanged' });
      scheduleNextPoll(POLL_INTERVAL);
      return;
    }

    lastHash = hash;
    const parsed = JSON.parse(data);
    self.postMessage({ type: 'news', data: parsed.articles || [], hash: hash, version: parsed.version || remoteVersion });
    consecutiveErrors = 0;
    scheduleNextPoll(POLL_INTERVAL);
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || 'Network error' });
    consecutiveErrors++;
    let nextInterval = POLL_INTERVAL;
    if (consecutiveErrors >= 3) nextInterval = 30000;
    if (consecutiveErrors >= 6) nextInterval = 60000;
    scheduleNextPoll(nextInterval);
  }
}

self.onmessage = function(e) {
  if (e.data && e.data.type === 'init') {
    BASE_URL = e.data.baseUrl || '';
    FETCH_URL = BASE_URL + '/news/news-feed.json';
    VERSION_URL = BASE_URL + '/news/version.txt';
    fetchNews();
  }
  if (e.data && e.data.type === 'refresh') {
    fetchNews();
  }
};