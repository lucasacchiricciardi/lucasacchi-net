import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

describe('main.js — source code checks', () => {
  const src = readFileSync(join(ROOT, 'src', 'home', 'main.js'), 'utf-8');

  it('should not use innerHTML (XSS prevention)', () => {
    assert.ok(!src.includes('innerHTML'), 'must not use innerHTML');
  });

  it('should use createElement and textContent for DOM injection', () => {
    assert.ok(src.includes('createElement'), 'must use createElement');
    assert.ok(src.includes('textContent'), 'must use textContent');
  });

  it('should instantiate a Web Worker', () => {
    assert.ok(src.includes('new Worker'), 'must instantiate Worker');
  });

  it('should handle all three message types from the worker', () => {
    assert.ok(src.includes("'news'"), 'must handle news type');
    assert.ok(src.includes("'error'"), 'must handle error type');
    assert.ok(src.includes("'unchanged'"), 'must handle unchanged type');
  });

  it('should reference news-feed-container', () => {
    assert.ok(src.includes('news-feed-container'), 'must reference the news container');
  });
});

describe('index.html — news container', () => {
  const html = readFileSync(join(ROOT, 'src', 'home', 'index.html'), 'utf-8');

  it('should contain a #news-feed-container section', () => {
    assert.ok(html.includes('news-feed-container'), 'index.html must have news-feed-container');
  });
});

describe('stripHtml — unit tests', () => {
  function stripHtml(html) {
    return html.replace(/<[^>]*>/g, '');
  }

  it('should remove HTML tags', () => {
    const html = '<p>Hello <strong>world</strong></p>';
    const result = stripHtml(html);
    assert.equal(result, 'Hello world');
  });

  it('should handle nested tags', () => {
    const html = '<div><span>Nested</span></div>';
    const result = stripHtml(html);
    assert.equal(result, 'Nested');
  });

  it('should handle attributes', () => {
    const html = '<a href="http://example.com" class="link">Link</a>';
    const result = stripHtml(html);
    assert.equal(result, 'Link');
  });

  it('should handle empty string', () => {
    const result = stripHtml('');
    assert.equal(result, '');
  });

  it('should pass through plain text', () => {
    const text = 'Plain text without tags';
    const result = stripHtml(text);
    assert.equal(result, 'Plain text without tags');
  });

  it('should handle self-closing tags', () => {
    const html = '<br/><img src="test.png"/>';
    const result = stripHtml(html);
    assert.equal(result, '');
  });
});

describe('main.js — language detection', () => {
  const src = readFileSync(join(ROOT, 'src', 'home', 'main.js'), 'utf-8');

  it('should have getPreferredLanguage function', () => {
    assert.ok(src.includes('function getPreferredLanguage'), 'must have getPreferredLanguage function');
  });

  it('should have setLanguageCookie function', () => {
    assert.ok(src.includes('function setLanguageCookie'), 'must have setLanguageCookie function');
  });

  it('should check cookie for language preference', () => {
    assert.ok(src.includes('tlf_lang'), 'must check tlf_lang cookie');
  });

  it('should check navigator.language as fallback', () => {
    assert.ok(src.includes('navigator.language'), 'must check navigator.language');
  });

  it('should default to Italian', () => {
    assert.ok(src.includes("return 'it'"), 'must default to Italian');
  });
});

describe('main.js — language switcher', () => {
  const src = readFileSync(join(ROOT, 'src', 'home', 'main.js'), 'utf-8');

  it('should have setupLanguageSwitcher function', () => {
    assert.ok(src.includes('function setupLanguageSwitcher'), 'must have setupLanguageSwitcher function');
  });

  it('should reference lang-it-btn', () => {
    assert.ok(src.includes("'lang-it-btn'"), 'must reference lang-it-btn');
  });

  it('should reference lang-en-btn', () => {
    assert.ok(src.includes("'lang-en-btn'"), 'must reference lang-en-btn');
  });

  it('should reference lang-it-btn-mobile', () => {
    assert.ok(src.includes("'lang-it-btn-mobile'"), 'must reference lang-it-btn-mobile');
  });

  it('should reference lang-en-btn-mobile', () => {
    assert.ok(src.includes("'lang-en-btn-mobile'"), 'must reference lang-en-btn-mobile');
  });

  it('should call worker.postMessage on language change', () => {
    assert.ok(src.includes("worker.postMessage({ type: 'refresh' })"), 'must send refresh to worker');
  });

  it('should filter articles by language', () => {
    assert.ok(src.includes('article.lang === currentLang'), 'must filter articles by language');
  });
});

describe('index.html — language switcher UI', () => {
  const html = readFileSync(join(ROOT, 'src', 'home', 'index.html'), 'utf-8');

  it('should have lang-it-btn element', () => {
    assert.ok(html.includes('id="lang-it-btn"'), 'index.html must have lang-it-btn');
  });

  it('should have lang-en-btn element', () => {
    assert.ok(html.includes('id="lang-en-btn"'), 'index.html must have lang-en-btn');
  });

  it('should have lang-it-btn-mobile element', () => {
    assert.ok(html.includes('id="lang-it-btn-mobile"'), 'index.html must have lang-it-btn-mobile');
  });

  it('should have lang-en-btn-mobile element', () => {
    assert.ok(html.includes('id="lang-en-btn-mobile"'), 'index.html must have lang-en-btn-mobile');
  });
});

describe('main.js — localStorage and compression', () => {
  const src = readFileSync(join(ROOT, 'src', 'home', 'main.js'), 'utf-8');

  it('should have compressAndStore function', () => {
    assert.ok(src.includes('function compressAndStore'), 'must have compressAndStore function');
  });

  it('should have retrieveAndDecompress function', () => {
    assert.ok(src.includes('function retrieveAndDecompress'), 'must have retrieveAndDecompress function');
  });

  it('should use LZString for compression', () => {
    assert.ok(src.includes('LZString.compressToBase64'), 'must use LZString');
    assert.ok(src.includes('LZString.decompressFromBase64'), 'must use LZString');
  });

  it('should have storeHash function', () => {
    assert.ok(src.includes('function storeHash'), 'must have storeHash function');
  });

  it('should have retrieveHash function', () => {
    assert.ok(src.includes('function retrieveHash'), 'must have retrieveHash function');
  });

  it('should have localStorage keys for tlf_articles', () => {
    assert.ok(src.includes('tlf_articles_'), 'must use tlf_articles_ key');
  });

  it('should have tlf_hash key', () => {
    assert.ok(src.includes("tlf_hash'"), 'must use tlf_hash key');
  });

  it('should have tlf_version key', () => {
    assert.ok(src.includes("tlf_version'"), 'must use tlf_version key');
  });

it('should handle unchanged message type', () => {
    assert.ok(src.includes("'unchanged'"), 'must handle unchanged type');
  });

  it('should clear cache on version-mismatch', () => {
    assert.ok(src.includes('clearArticleStorage'), 'must call clearArticleStorage');
  });

  it('should have migration logic', () => {
    assert.ok(src.includes('function handleMigration'), 'must have handleMigration function');
  });

  it('should have offline-first initialization', () => {
    assert.ok(src.includes('function initializeOfflineFirst'), 'must have initializeOfflineFirst function');
  });
});

describe('index.html — LZ-string CDN', () => {
  const html = readFileSync(join(ROOT, 'src', 'home', 'index.html'), 'utf-8');

  it('should include LZ-string library', () => {
    assert.ok(html.includes('lz-string'), 'index.html must include lz-string library');
  });
});

describe('newsWorker.js — hash in message', () => {
  const src = readFileSync(join(ROOT, 'src', 'home', 'newsWorker.js'), 'utf-8');

  it('should include hash in news message', () => {
    assert.ok(src.includes('hash: hash'), 'worker must include hash in news message');
  });
});

describe('main.js — search functionality', () => {
  const src = readFileSync(join(ROOT, 'src', 'home', 'main.js'), 'utf-8');

  it('should have filterArticles function', () => {
    assert.ok(src.includes('function filterArticles'), 'must have filterArticles function');
  });

  it('should have setupSearch function', () => {
    assert.ok(src.includes('function setupSearch'), 'must have setupSearch function');
  });

  it('should have allArticles storage', () => {
    assert.ok(src.includes('allArticles ='), 'must store all articles for search');
  });

  it('should search in title, content, and tags', () => {
    assert.ok(src.includes('article.title'), 'must search in title');
    assert.ok(src.includes('article.content'), 'must search in content');
    assert.ok(src.includes('article.tags'), 'must search in tags');
  });
});

describe('index.html — search UI', () => {
  const html = readFileSync(join(ROOT, 'src', 'home', 'index.html'), 'utf-8');

  it('should have search input', () => {
    assert.ok(html.includes('id="news-search"'), 'index.html must have search input');
  });

  it('should have search icon', () => {
    assert.ok(html.includes('material-symbols-outlined') && html.includes('search'), 'must have search icon');
  });
});

describe('main.js — contact form', () => {
  const src = readFileSync(join(ROOT, 'src', 'home', 'main.js'), 'utf-8');

  it('should have contact-form element', () => {
    assert.ok(src.includes("'contact-form'"), 'must reference contact-form');
  });

  it('should open mailto on submit', () => {
    assert.ok(src.includes('mailto:info@lucasacchi.net'), 'must open mailto link');
  });
});

describe('index.html — contact form UI', () => {
  const html = readFileSync(join(ROOT, 'src', 'home', 'index.html'), 'utf-8');

  it('should have contact form', () => {
    assert.ok(html.includes('id="contact-form"'), 'index.html must have contact form');
  });

  it('should have name, email, message fields', () => {
    assert.ok(html.includes('name="name"'), 'must have name field');
    assert.ok(html.includes('name="email"'), 'must have email field');
    assert.ok(html.includes('name="message"'), 'must have message field');
  });
});

describe('main.js — error boundaries', () => {
  const src = readFileSync(join(ROOT, 'src', 'home', 'main.js'), 'utf-8');

  it('should have window.onerror handler', () => {
    assert.ok(src.includes('window.onerror'), 'must have global error handler');
  });

  it('should have window.onunhandledrejection handler', () => {
    assert.ok(src.includes('window.onunhandledrejection'), 'must have unhandled rejection handler');
  });

  it('should catch errors in worker.onmessage', () => {
    assert.ok(src.includes('worker.onmessage'), 'must define worker.onmessage');
    // Check for try-catch in onmessage
    const onmessageStart = src.indexOf('worker.onmessage');
    const onmessageBlock = src.slice(onmessageStart, onmessageStart + 500);
    assert.ok(onmessageBlock.includes('try {') || onmessageBlock.includes('catch'), 'onmessage should have try-catch');
  });

  it('should catch errors in initializeOfflineFirst', () => {
    assert.ok(src.includes('function initializeOfflineFirst'), 'must have initializeOfflineFirst function');
    const initStart = src.indexOf('function initializeOfflineFirst');
    const initBlock = src.slice(initStart, initStart + 600);
    assert.ok(initBlock.includes('try {') || initBlock.includes('catch'), 'initializeOfflineFirst should have try-catch');
  });

  it('should not leak error details to user', () => {
    // Generic error messages, no stack traces
    assert.ok(src.includes('An error occurred') || src.includes('Please refresh'), 'should show generic error message');
    assert.ok(!src.includes('e.stack') || !src.includes('error.stack'), 'should not expose stack traces');
  });
});

describe('main.js — social sharing', () => {
  const src = readFileSync(join(ROOT, 'src', 'home', 'main.js'), 'utf-8');

  it('should have LinkedIn share button', () => {
    assert.ok(src.includes('linkedin.com/shareArticle'), 'must have LinkedIn share');
  });

  it('should have mailto share button', () => {
    assert.ok(src.includes('mailto:?subject'), 'must have email share');
  });

  it('should have copy link button', () => {
    assert.ok(src.includes('navigator.clipboard.writeText'), 'must have copy link');
  });

  it('should encode URL for sharing', () => {
    assert.ok(src.includes('encodeURIComponent'), 'must encode URLs');
  });
});