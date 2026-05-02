(function() {
  function getPreferredLanguage() {
    var cookieRow = document.cookie.split('; ').find(function(row) { return row.startsWith('lsn_lang='); });
    if (cookieRow) {
      var langCookie = cookieRow.split('=')[1];
      if (langCookie) return langCookie;
    }
    var browserLang = navigator.language || navigator.userLanguage;
    if (browserLang && browserLang.startsWith('it')) return 'it';
    if (browserLang && browserLang.startsWith('en')) return 'en';
    return 'it';
  }

  var currentLang = getPreferredLanguage();
  
  function initLanguage() {
    if (!window.i18n || !window.i18n.initI18n || !window.i18n.t) {
      setTimeout(initLanguage, 100);
      return;
    }
    
    window.i18n.initI18n(currentLang);
    updateAllTranslations(currentLang);
    attachLangListeners();
  }
  
  function setLanguageCookie(lang) {
    document.cookie = 'lsn_lang=' + lang + '; expires=Fri, 31 Dec 9999 23:59:59 GMT; path=/';
  }
  
  function updateLanguageUI(lang) {
    var itBtn = document.getElementById('lang-it-btn');
    var enBtn = document.getElementById('lang-en-btn');
    if (itBtn) {
      itBtn.classList.toggle('border-primary', lang === 'it');
      itBtn.classList.toggle('border-outline-variant/20', lang !== 'it');
    }
    if (enBtn) {
      enBtn.classList.toggle('border-primary', lang === 'en');
      enBtn.classList.toggle('border-outline-variant/20', lang !== 'en');
    }
  }
  
  function updateAllTranslations(lang) {
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
      var key = el.getAttribute('data-i18n');
      var text = window.i18n.t(key, lang);
      if (text) el.textContent = text;
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
      var key = el.getAttribute('data-i18n-placeholder');
      var text = window.i18n.t(key, lang);
      if (text) el.placeholder = text;
    });

    if (document.body.hasAttribute('data-page-thank-you')) {
      document.title = window.i18n.t('thankYou.pageTitle', lang) || document.title;
    }
  }
  
  function switchLanguage(lang) {
    currentLang = lang;
    setLanguageCookie(lang);
    updateLanguageUI(lang);
    window.i18n.initI18n(lang);
    updateAllTranslations(lang);
  }
  
  function attachLangListeners() {
    var itBtn = document.getElementById('lang-it-btn');
    var enBtn = document.getElementById('lang-en-btn');
    if (itBtn) itBtn.addEventListener('click', function() { 
      if (currentLang !== 'it') switchLanguage('it'); 
    });
    if (enBtn) enBtn.addEventListener('click', function() { 
      if (currentLang !== 'en') switchLanguage('en'); 
    });
  }
  
  // Initialize after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLanguage);
  } else {
    initLanguage();
  }
})();
