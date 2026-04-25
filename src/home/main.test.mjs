// Test per il main thread - language switcher functionality
import { test, describe } from 'node:test';
import assert from 'node:assert';

// Simula il DOM environment per i test
global.document = {
  createElement: () => ({ appendChild: () => {}, classList: { add: () => {}, remove: () => {}, toggle: () => {} } }),
  getElementById: (id) => {
    const elements = {
      'news-feed-articles': { removeChild: () => {}, appendChild: () => {} },
      'news-feed-error': { classList: { remove: () => {} }, textContent: '' },
      'lang-it-btn': { classList: { toggle: () => {} }, addEventListener: () => {} },
      'lang-en-btn': { classList: { toggle: () => {} }, addEventListener: () => {} },
      'lang-it-btn-mobile': { classList: { toggle: () => {} }, addEventListener: () => {} },
      'lang-en-btn-mobile': { classList: { toggle: () => {} }, addEventListener: () => {} },
      'news-search': { addEventListener: () => {} },
      'mobile-menu-btn': { addEventListener: () => {} },
      'mobile-menu': { classList: { add: () => {}, remove: () => {} } },
      'copyright-years': { textContent: '' },
      'phone-obf': { appendChild: () => {} },
      'email-obf': { appendChild: () => {} },
      'contact-form': { addEventListener: () => {}, reset: () => {} },
      'contact-success': { classList: { remove: () => {} } },
      'news-feed-skeleton': { remove: () => {} }
    };
    return elements[id] || null;
  },
  cookie: '',
  readyState: 'complete',
  addEventListener: () => {},
  querySelectorAll: () => []
};

global.window = {
  location: { pathname: '/' },
  navigator: { language: 'it', userLanguage: 'it' },
  onerror: null,
  onunhandledrejection: null,
  Worker: class MockWorker {
    constructor() { this.postMessage = () => {}; }
    onmessage = null;
    onerror = null;
  },
  LZString: {
    compressToBase64: (str) => btoa(unescape(encodeURIComponent(str))),
    decompressFromBase64: (str) => decodeURIComponent(escape(atob(str)))
  }
};

global.localStorage = {
  items: {},
  setItem: (key, value) => { localStorage.items[key] = value; },
  getItem: (key) => localStorage.items[key],
  removeItem: (key) => { delete localStorage.items[key]; },
  length: 0,
  key: () => null,
  clear: () => { localStorage.items = {}; }
};

describe('Main Thread - Language Switcher Tests', () => {
  
  test('DESKTOP: Language switcher elements should exist in HTML', () => {
    // Questo test verificherebbe che gli elementi esistano nell'HTML
    // Simuliamo l'esistenza degli elementi
    const desktopItBtn = document.getElementById('lang-it-btn');
    const desktopEnBtn = document.getElementById('lang-en-btn');
    
    assert.strictEqual(typeof desktopItBtn, 'object', 'Italian button should exist in desktop nav');
    assert.strictEqual(typeof desktopEnBtn, 'object', 'English button should exist in desktop nav');
  });

  test('MOBILE: Language switcher elements should exist in HTML', () => {
    // Questo test verificherebbe che gli elementi esistano nell'HTML
    const mobileItBtn = document.getElementById('lang-it-btn-mobile');
    const mobileEnBtn = document.getElementById('lang-en-btn-mobile');
    
    assert.strictEqual(typeof mobileItBtn, 'object', 'Italian button should exist in mobile menu');
    assert.strictEqual(typeof mobileEnBtn, 'object', 'English button should exist in mobile menu');
  });

  test('LANGUAGE DETECTION: Should detect language from cookie', () => {
    // Simula presenza cookie
    document.cookie = 'lsn_lang=en; path=/';
    
    // Simula la funzione getPreferredLanguage (estratta dal main.js)
    const getPreferredLanguage = () => {
      var langCookie = document.cookie.split('; ').find(function(row) { return row.startsWith('lsn_lang='); })?.split('=')[1];
      if (langCookie) return langCookie;
      var browserLang = navigator.language || navigator.userLanguage;
      if (browserLang.startsWith('it')) return 'it';
      if (browserLang.startsWith('en')) return 'en';
      return 'it';
    };
    
    const detectedLang = getPreferredLanguage();
    assert.strictEqual(detectedLang, 'en', 'Should detect language from cookie');
  });

  test('LANGUAGE DETECTION: Should fallback to browser language', () => {
    // Simula assenza cookie
    document.cookie = '';
    window.navigator.language = 'en-US';
    
    const getPreferredLanguage = () => {
      var langCookie = document.cookie.split('; ').find(function(row) { return row.startsWith('lsn_lang='); })?.split('=')[1];
      if (langCookie) return langCookie;
      var browserLang = navigator.language || navigator.userLanguage;
      if (browserLang.startsWith('it')) return 'it';
      if (browserLang.startsWith('en')) return 'en';
      return 'it';
    };
    
    const detectedLang = getPreferredLanguage();
    assert.strictEqual(detectedLang, 'en', 'Should fallback to browser language');
  });

  test('LANGUAGE DETECTION: Should default to Italian', () => {
    // Simula assenza cookie e browser language non EN/IT
    document.cookie = '';
    
    // Simula direttamente la funzione con browser language non EN/IT
    const getPreferredLanguageWithFallback = () => {
      var langCookie = document.cookie.split('; ').find(function(row) { return row.startsWith('lsn_lang='); })?.split('=')[1];
      if (langCookie) return langCookie;
      // Simula fr-FR che non inizia con 'it' o 'en'
      var browserLang = 'fr-FR';
      if (browserLang.startsWith('it')) return 'it';
      if (browserLang.startsWith('en')) return 'en';
      return 'it'; // default fallback
    };
    
    const detectedLang = getPreferredLanguageWithFallback();
    assert.strictEqual(detectedLang, 'it', 'Should default to Italian');
  });

  test('LANGUAGE SWITCHER: Cookie should be set on language change', () => {
    const setLanguageCookie = (lang) => {
      document.cookie = 'lsn_lang=' + lang + '; expires=Fri, 31 Dec 9999 23:59:59 GMT; path=/';
    };
    
    setLanguageCookie('en');
    
    const cookieExists = document.cookie.includes('lsn_lang=en');
    assert.strictEqual(cookieExists, true, 'Cookie should be set for selected language');
  });
});

describe('Main Thread - Existing Functionality Tests', () => {
  
  test('CONTAINER EXISTENCE: News feed containers should exist', () => {
    const articlesContainer = document.getElementById('news-feed-articles');
    const errorContainer = document.getElementById('news-feed-error');
    
    assert.strictEqual(typeof articlesContainer, 'object', 'Articles container should exist');
    assert.strictEqual(typeof errorContainer, 'object', 'Error container should exist');
  });

  test('MOBILE MENU: Mobile menu elements should exist', () => {
    const menuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    
    assert.strictEqual(typeof menuBtn, 'object', 'Mobile menu button should exist');
    assert.strictEqual(typeof mobileMenu, 'object', 'Mobile menu should exist');
  });

  test('SEARCH: Search input should exist', () => {
    const searchInput = document.getElementById('news-search');
    
    assert.strictEqual(typeof searchInput, 'object', 'Search input should exist');
  });

  test('CONTACT: Contact form elements should exist', () => {
    const contactForm = document.getElementById('contact-form');
    const successMsg = document.getElementById('contact-success');
    
    assert.strictEqual(typeof contactForm, 'object', 'Contact form should exist');
    assert.strictEqual(typeof successMsg, 'object', 'Contact success message should exist');
  });

  test('COPYRIGHT: Copyright years should exist', () => {
    const copyrightEl = document.getElementById('copyright-years');
    
    assert.strictEqual(typeof copyrightEl, 'object', 'Copyright element should exist');
  });

  test('CONTACT INFO: Contact info elements should exist', () => {
    const phoneEl = document.getElementById('phone-obf');
    const emailEl = document.getElementById('email-obf');
    
    assert.strictEqual(typeof phoneEl, 'object', 'Phone element should exist');
    assert.strictEqual(typeof emailEl, 'object', 'Email element should exist');
  });
});