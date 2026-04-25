(function() {
// Wait for DOM if script is deferred
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    init();
  });
} else {
  init();
}
    
    function init() {

  function init() {
    // Global error handlers for production
    window.onerror = function(message, source, lineno, colno, error) {
      showError(window.i18n.t('meta.genericError', currentLang, 'An error occurred. Please refresh the page.'));
      return false;
    };

    window.onunhandledrejection = function(event) {
      showError(window.i18n.t('meta.genericError', currentLang, 'An error occurred. Please refresh the page.'));
    };

    var worker;
    try {
      var pathParts = window.location.pathname.split('/').filter(Boolean);
      var baseUrl = pathParts.length > 0 ? '/' + pathParts[0] : '';
      
      worker = new Worker(baseUrl + 'newsWorker.js');
      worker.postMessage({ type: 'init', baseUrl: baseUrl });
    } catch (e) {
      showError(window.i18n.t('meta.failedToInitializeNews', currentLang));
      return;
    }

    var articlesContainer = document.getElementById('news-feed-articles');
    var errorContainer = document.getElementById('news-feed-error');
    
    if (!articlesContainer || !errorContainer) {
      console.error('News feed containers not found:', { articlesContainer, errorContainer });
      showError(window.i18n.t('meta.unableToLoadNews', currentLang));
      return;
    }

    var currentLang = getPreferredLanguage();

    function getPreferredLanguage() {
      var langCookie = document.cookie.split('; ').find(function(row) { return row.startsWith('lsn_lang='); })?.split('=')[1];
      if (langCookie) return langCookie;
      var browserLang = navigator.language || navigator.userLanguage;
      if (browserLang.startsWith('it')) return 'it';
      if (browserLang.startsWith('en')) return 'en';
      return 'it';
    }

    // Initialize i18n
    var translations = window.i18n.initI18n(currentLang);

    function setLanguageCookie(lang) {
      document.cookie = 'lsn_lang=' + lang + '; expires=Fri, 31 Dec 9999 23:59:59 GMT; path=/';
    }

     var STORAGE_KEYS = {
       ARTICLES: function(lang) { return 'lsn_articles_' + lang; },
       LANG: 'lsn_lang',
       HASH: 'lsn_hash',
       VERSION: 'lsn_version',
       APP_VERSION: 'lsn_app_version'
     };

    function compressAndStore(lang, articles) {
      try {
        var articlesJson = JSON.stringify(articles);
        var compressed = LZString.compressToBase64(articlesJson);
        localStorage.setItem(STORAGE_KEYS.ARTICLES(lang), compressed);
      } catch (e) {
        // Silent fail
      }
    }

function retrieveAndDecompress(lang) {
  try {
    // Try to get articles for requested language
    var compressed = localStorage.getItem(STORAGE_KEYS.ARTICLES(lang));
    if (compressed) {
      var decompressed = LZString.decompressFromBase64(compressed);
      return decompressed ? JSON.parse(decompressed) : null;
    }
    
    // If not found, try to get articles from ANY language storage key
    // (since all language keys contain the full articles dataset)
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key.startsWith('tlf_articles_')) {
        compressed = localStorage.getItem(key);
        if (compressed) {
          var decompressed = LZString.decompressFromBase64(compressed);
          return decompressed ? JSON.parse(decompressed) : null;
        }
      }
    }
    
    return null;
  } catch (e) {
    localStorage.removeItem(STORAGE_KEYS.ARTICLES(lang));
    return null;
  }
}

    function storeHash(hash) {
      localStorage.setItem(STORAGE_KEYS.HASH, hash);
    }

    function retrieveHash() {
      return localStorage.getItem(STORAGE_KEYS.HASH);
    }

    function retrieveVersion() {
      return localStorage.getItem(STORAGE_KEYS.APP_VERSION);
    }

    function storeVersion(version) {
      localStorage.setItem(STORAGE_KEYS.VERSION, version);
    }

    function clearArticleStorage(lang) {
      localStorage.removeItem(STORAGE_KEYS.ARTICLES(lang));
      localStorage.removeItem(STORAGE_KEYS.HASH);
    }

    function handleMigration() {
      var storedVersion = localStorage.getItem(STORAGE_KEYS.VERSION);
      var CURRENT_SCHEMA_VERSION = '2.0.0';
      if (!storedVersion || storedVersion !== CURRENT_SCHEMA_VERSION) {
        Object.keys(localStorage).forEach(function(key) {
          if (key.startsWith('lsn_')) {
            localStorage.removeItem(key);
          }
        });
        localStorage.setItem(STORAGE_KEYS.VERSION, CURRENT_SCHEMA_VERSION);
        return true;
      }
      return false;
    }

     function initializeOfflineFirst() {
       handleMigration();
       // Store app version for version checking
       storeVersion('2.0.0');
       try {
         var storedArticles = retrieveAndDecompress(currentLang);
         if (storedArticles && storedArticles.length > 0) {
           allArticles = storedArticles;
           var filteredArticles = storedArticles.filter(function(article) { return article.lang === currentLang; });
           renderArticles(filteredArticles);
           worker.postMessage({ type: 'refresh' });
         }
       } catch (e) {
         // Fetch normally
       }
     }

    function createArticleElement(article) {
      var card = document.createElement('article');
      card.className = 'bg-surface-container-low p-8 border-t-4 border-primary hover:bg-surface-container-high transition-colors group';

      var title = document.createElement('h3');
      title.className = 'font-headline text-xl font-bold text-on-surface mb-2 group-hover:text-primary transition-colors';
      title.textContent = article.title;
      card.appendChild(title);

      if (article.date) {
        var date = document.createElement('span');
        date.className = 'font-label text-xs text-on-surface-variant uppercase tracking-wider';
        date.textContent = article.date;
        card.appendChild(date);
      }

      if (article.tags && article.tags.length > 0) {
        var tagsRow = document.createElement('div');
        tagsRow.className = 'flex flex-wrap gap-2 mt-3 mb-4';
        article.tags.forEach(function(tag) {
          var tagEl = document.createElement('span');
          tagEl.className = 'font-label text-[10px] uppercase tracking-widest text-on-surface-variant bg-surface-container-highest px-2 py-1';
          tagEl.textContent = tag;
          tagsRow.appendChild(tagEl);
        });
        card.appendChild(tagsRow);
      }

      if (article.content) {
        var excerpt = document.createElement('p');
        excerpt.className = 'font-body text-sm text-on-surface-variant leading-relaxed mt-3';
        var text = stripHtml(article.html || article.content);
        excerpt.textContent = text.split(' ').slice(0, 50).join(' ') + '...';
        card.appendChild(excerpt);
      }

      if (allArticles.length > 0) {
        var related = getRelatedArticles(article, 2);
        renderRelatedArticles(related, card);
      }

      // Social share buttons
      var shareRow = document.createElement('div');
      shareRow.className = 'flex gap-3 mt-4 pt-4 border-t border-outline-variant/20';
      
      var linkedinBtn = document.createElement('a');
      linkedinBtn.className = 'text-on-surface-variant hover:text-[#0077b5] transition-colors text-sm font-label';
      linkedinBtn.href = 'https://www.linkedin.com/shareArticle?mini=true&url=' + encodeURIComponent('https://lucasacchi.net/') + '&title=' + encodeURIComponent(article.title);
      linkedinBtn.target = '_blank';
      linkedinBtn.title = 'Share on LinkedIn';
      var linkedinIcon = document.createElement('span');
      linkedinIcon.className = 'material-symbols-outlined';
      linkedinIcon.textContent = 'work';
      linkedinBtn.appendChild(linkedinIcon);
      shareRow.appendChild(linkedinBtn);
      
      var emailBtn = document.createElement('a');
      emailBtn.className = 'text-on-surface-variant hover:text-primary transition-colors text-sm font-label';
      emailBtn.href = 'mailto:?subject=' + encodeURIComponent(article.title) + '&body=' + encodeURIComponent(article.title + '\n\nhttps://lucasacchi.net/');
      emailBtn.title = 'Share via email';
      var emailIcon = document.createElement('span');
      emailIcon.className = 'material-symbols-outlined';
      emailIcon.textContent = 'mail';
      emailBtn.appendChild(emailIcon);
      shareRow.appendChild(emailBtn);
      
      var copyBtn = document.createElement('button');
      copyBtn.className = 'text-on-surface-variant hover:text-primary transition-colors text-sm font-label';
      copyBtn.title = 'Copy link';
      var copyIcon = document.createElement('span');
      copyIcon.className = 'material-symbols-outlined';
      copyIcon.textContent = 'link';
      copyBtn.appendChild(copyIcon);
      copyBtn.addEventListener('click', function() {
        navigator.clipboard.writeText('https://lucasacchi.net/').then(function() {
          copyIcon.textContent = 'check';
          setTimeout(function() { copyIcon.textContent = 'link'; }, 2000);
        });
      });
      shareRow.appendChild(copyBtn);
      
      card.appendChild(shareRow);

      return card;
    }

    function stripHtml(html) {
      return html.replace(/<[^>]*>/g, '');
    }

    function renderArticles(articles) {
      var skeleton = document.getElementById('news-feed-skeleton');
      if (skeleton) skeleton.remove();
      while (articlesContainer.firstChild) {
        articlesContainer.removeChild(articlesContainer.firstChild);
      }
      
      if (articles.length === 0) {
        // Show no articles message
        var noArticlesMsg = document.createElement('div');
        noArticlesMsg.className = 'col-span-full text-center py-12';
        noArticlesMsg.innerHTML = '<p class="font-body text-lg text-on-surface-variant">' + window.i18n.t('status.noArticlesFound', currentLang) + '</p>';
        articlesContainer.appendChild(noArticlesMsg);
      } else {
        articles.forEach(function(article) {
          articlesContainer.appendChild(createArticleElement(article));
        });
      }
    }

    var allArticles = [];
    
    function filterArticles(query) {
      var q = query.toLowerCase().trim();
      if (!q) {
        return allArticles.filter(function(a) { return a.lang === currentLang; });
      }
      return allArticles.filter(function(a) {
        if (a.lang !== currentLang) return false;
        var title = (a.title || '').toLowerCase();
        var content = (a.content || '').toLowerCase();
        var tags = (a.tags || []).join(' ').toLowerCase();
        return title.includes(q) || content.includes(q) || tags.includes(q);
      });
    }
    
    function setupSearch() {
      var searchInput = document.getElementById('news-search');
      if (searchInput) {
        searchInput.addEventListener('input', function(e) {
          var filtered = filterArticles(e.target.value);
          renderArticles(filtered);
        });
      }
    }
    
    function getRelatedArticles(currentArticle, limit) {
      if (!currentArticle || !currentArticle.tags || currentArticle.tags.length === 0) return [];
      var currentTags = currentArticle.tags;
      return allArticles
        .filter(function(a) {
          if (a.lang !== currentLang) return false;
          if (a.id === currentArticle.id) return false;
          var shared = a.tags.filter(function(t) { return currentTags.includes(t); });
          return shared.length > 0;
        })
        .sort(function(a, b) {
          var aShared = a.tags.filter(function(t) { return currentTags.includes(t); }).length;
          var bShared = b.tags.filter(function(t) { return currentTags.includes(t); }).length;
          return bShared - aShared;
        })
        .slice(0, limit || 3);
    }
    
    function renderRelatedArticles(related, container) {
      if (!related || related.length === 0 || !container) return;
      var relatedHeader = document.createElement('div');
      relatedHeader.className = 'mt-4 pt-4 border-t border-outline-variant/20';
      var relatedLabel = document.createElement('span');
      relatedLabel.className = 'font-label text-xs text-on-surface-variant uppercase tracking-widest';
      relatedLabel.textContent = 'Related';
      relatedHeader.appendChild(relatedLabel);
      container.appendChild(relatedHeader);
      related.forEach(function(article) {
        var link = document.createElement('a');
        link.className = 'block text-sm text-primary hover:text-primary-container mt-2 font-body';
        link.textContent = '→ ' + article.title;
        container.appendChild(link);
      });
    }

    function showError(message) {
      if (errorContainer) {
        errorContainer.textContent = message;
        errorContainer.classList.remove('hidden');
      }
    }

    var menuBtn = document.getElementById('mobile-menu-btn');
    var mobileMenu = document.getElementById('mobile-menu');
    if (menuBtn && mobileMenu) {
      menuBtn.addEventListener('click', function() {
        if (mobileMenu.classList.contains('hidden')) {
          mobileMenu.classList.remove('hidden');
          var icon = menuBtn.querySelector('.material-symbols-outlined');
          if (icon) icon.textContent = 'close';
          var firstLink = mobileMenu.querySelector('a');
          if (firstLink) firstLink.focus();
          function handleEscape(e) {
            if (e.key === 'Escape') {
              closeMenu();
              document.removeEventListener('keydown', handleEscape);
            }
          }
          document.addEventListener('keydown', handleEscape);
        } else {
          closeMenu();
        }
        function closeMenu() {
          mobileMenu.classList.add('hidden');
          var icon = menuBtn.querySelector('.material-symbols-outlined');
          if (icon) icon.textContent = 'menu';
          menuBtn.focus();
        }
      });
    }

    var copyrightEl = document.getElementById('copyright-years');
    if (copyrightEl) {
      copyrightEl.textContent = '2023 - ' + new Date().getFullYear();
    }

    var phoneEl = document.getElementById('phone-obf');
    if (phoneEl) {
      var p = '+39 ' + '393' + '92' + '42165';
      var phA = document.createElement('a');
      phA.href = 'tel:' + p;
      phA.textContent = p;
      phA.className = 'text-on-surface-variant hover:text-primary transition-colors';
      phoneEl.appendChild(phA);
    }

    var emailEl = document.getElementById('email-obf');
    if (emailEl) {
      var e = 'info' + '@' + 'lucasacchi.net';
      var emA = document.createElement('a');
      emA.href = 'mailto:' + e;
      emA.textContent = e;
      emA.className = 'text-on-surface-variant hover:text-primary transition-colors';
      emailEl.appendChild(emA);
    }

    worker.onmessage = function(e) {
      try {
        var msg = e.data;
        if (msg.type === 'news') {
          compressAndStore(currentLang, msg.data);
          if (msg.hash) storeHash(msg.hash);
          if (msg.version) storeVersion(msg.version);
          allArticles = msg.data;
          var filteredArticles = msg.data.filter(function(article) { return article.lang === currentLang; });
          renderArticles(filteredArticles);
        } else if (msg.type === 'error') {
          showError('Unable to load news. Please check your connection.');
    } else if (msg.type === 'unchanged') {
      // Re-filter and re-render with current language
      var filteredArticles = allArticles.filter(function(article) { return article.lang === currentLang; });
      renderArticles(filteredArticles);
    } else if (msg.type === 'version-mismatch') {
      // Clear local cache and reload
      clearArticleStorage(currentLang);
      storeVersion(msg.newVersion);
    }
      } catch (err) {
        showError('An error occurred while loading news.');
      }
    };

    worker.onerror = function(e) {
      showError('Worker runtime error: ' + e.message);
    };

    function setupLanguageSwitcher() {
      var itBtn = document.getElementById('lang-it-btn');
      var enBtn = document.getElementById('lang-en-btn');
      var itBtnMobile = document.getElementById('lang-it-btn-mobile');
      var enBtnMobile = document.getElementById('lang-en-btn-mobile');

      function updateSwitcherUI(lang) {
        if (itBtn) {
          itBtn.classList.toggle('border-primary', lang === 'it');
          itBtn.classList.toggle('border-outline-variant/20', lang !== 'it');
        }
        if (enBtn) {
          enBtn.classList.toggle('border-primary', lang === 'en');
          enBtn.classList.toggle('border-outline-variant/20', lang !== 'en');
        }
        if (itBtnMobile) {
          itBtnMobile.classList.toggle('border-primary', lang === 'it');
          itBtnMobile.classList.toggle('border-outline-variant/20', lang !== 'it');
        }
        if (enBtnMobile) {
          enBtnMobile.classList.toggle('border-primary', lang === 'en');
          enBtnMobile.classList.toggle('border-outline-variant/20', lang !== 'en');
        }
      }

      function switchLanguage(lang) {
        currentLang = lang;
        setLanguageCookie(lang);
        
        // Update UI texts
        updateUITexts(lang);
        translations = window.i18n.initI18n(lang);
        
        // Refresh news worker
        worker.postMessage({ type: 'refresh' });
        updateSwitcherUI(lang);
        
        // Re-render search if active
        var searchInput = document.getElementById('news-search');
        if (searchInput && searchInput.value) {
          var filtered = filterArticles(searchInput.value);
          renderArticles(filtered);
        }
      }

      if (itBtn) {
        itBtn.addEventListener('click', function() {
          if (currentLang !== 'it') switchLanguage('it');
        });
      }
      if (enBtn) {
        enBtn.addEventListener('click', function() {
          if (currentLang !== 'en') switchLanguage('en');
        });
      }
      if (itBtnMobile) {
        itBtnMobile.addEventListener('click', function() {
          if (currentLang !== 'it') switchLanguage('it');
        });
      }
      if (enBtnMobile) {
        enBtnMobile.addEventListener('click', function() {
          if (currentLang !== 'en') switchLanguage('en');
        });
      }

      updateSwitcherUI(currentLang);
    }

    function updateUITexts(lang) {
      // Update document title and lang attribute
      document.documentElement.lang = lang;
      document.title = 'The Linux Formula — Tools, Apps, and Insights for the Open Source World';
      
      // Update meta description
      var metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.content = t('meta.description', lang);
      }
      
      // Update navigation
      updateNavTexts(lang);
      
      // Update hero section
      updateHeroTexts(lang);
      
      // Update sections
      updateSectionTexts(lang);
      
      // Update expert section
      updateExpertTexts(lang);
      
      // Update insights section
      updateInsightsTexts(lang);
      
      // Update broadcast section
      updateBroadcastTexts(lang);
      
      // Update footer
      updateFooterTexts(lang);
    }

    function updateNavTexts(lang) {
      // Update desktop nav items
      var desktopNavItems = document.querySelectorAll('#nav-home, #nav-chi-sono, #nav-corsi, #nav-blog, #nav-contattami');
      desktopNavItems.forEach(function(element) {
        if (element.id === 'nav-home') element.textContent = window.i18n.t('nav.home', lang);
        else if (element.id === 'nav-chi-sono') element.textContent = window.i18n.t('nav.chiSono', lang);
        else if (element.id === 'nav-corsi') element.textContent = window.i18n.t('nav.corsi', lang);
        else if (element.id === 'nav-blog') element.textContent = window.i18n.t('nav.blog', lang);
        else if (element.id === 'nav-contattami') element.textContent = window.i18n.t('nav.contattami', lang);
      });
      
      // Update mobile nav items (separate elements)
      var mobileNavItems = document.querySelectorAll('#mobile-menu #nav-home, #mobile-menu #nav-chi-sono, #mobile-menu #nav-corsi, #mobile-menu #nav-blog, #mobile-menu #nav-contattami');
      mobileNavItems.forEach(function(element) {
        if (element.id === 'nav-home') element.textContent = window.i18n.t('nav.home', lang);
        else if (element.id === 'nav-chi-sono') element.textContent = window.i18n.t('nav.chiSono', lang);
        else if (element.id === 'nav-corsi') element.textContent = window.i18n.t('nav.corsi', lang);
        else if (element.id === 'nav-blog') element.textContent = window.i18n.t('nav.blog', lang);
        else if (element.id === 'nav-contattami') element.textContent = window.i18n.t('nav.contattami', lang);
      });
    }

    function updateHeroTexts(lang) {
      var scopriBtn = document.querySelector('[data-scopri-corsi]');
      if (scopriBtn) {
        scopriBtn.querySelector('span').textContent = window.i18n.t('hero.scopriCorsi', lang);
      }
      
      var contattamiBtn = document.querySelector('[data-contattami]');
      if (contattamiBtn) {
        contattamiBtn.querySelector('span').textContent = window.i18n.t('hero.contattami', lang);
      }
    }

    function updateSectionTexts(lang) {
      var expertTitle = document.querySelector('[data-section-expert]');
      if (expertTitle) {
        expertTitle.textContent = window.i18n.t('sections.subjectMatterExpert', lang);
      }
      
      var insightsTitle = document.querySelector('[data-section-insights]');
      if (insightsTitle) {
        insightsTitle.textContent = window.i18n.t('sections.latestInsights', lang);
      }
      
      var broadcastTitle = document.querySelector('[data-section-broadcast]');
      if (broadcastTitle) {
        broadcastTitle.textContent = window.i18n.t('sections.broadcastChannel', lang);
      }
    }

    function updateExpertTexts(lang) {
      var experienceEl = document.querySelector('[data-expert-experience]');
      if (experienceEl) {
        experienceEl.textContent = window.i18n.t('expert.experience', lang);
      }
      
      var specialtyEl = document.querySelector('[data-expert-specialty]');
      if (specialtyEl) {
        specialtyEl.textContent = window.i18n.t('expert.specialty', lang);
      }
      
      var roleEl = document.querySelector('[data-expert-role]');
      if (roleEl) {
        roleEl.textContent = window.i18n.t('expert.roleLabel', lang);
      }
    }

    function updateInsightsTexts(lang) {
      var searchInput = document.getElementById('news-search');
      if (searchInput) {
        searchInput.placeholder = t('status.searchArticles', lang);
      }
    }

    function updateBroadcastTexts(lang) {
      // Update broadcast texts if needed
    }

    function updateFooterTexts(lang) {
      var contactForm = document.getElementById('contact-form');
      if (contactForm) {
        var submitBtn = contactForm.querySelector('button[type="submit"]');
        if (submitBtn) {
          submitBtn.textContent = window.i18n.t('footer.send', lang);
        }
      }
    }

    setupLanguageSwitcher();
    initializeOfflineFirst();
    setupSearch();
    
    var contactForm = document.getElementById('contact-form');
    if (contactForm) {
      contactForm.addEventListener('submit', function(e) {
        e.preventDefault();
        var name = contactForm.querySelector('[name="name"]').value;
        var email = contactForm.querySelector('[name="email"]').value;
        var message = contactForm.querySelector('[name="message"]').value;
        var body = 'Name: ' + encodeURIComponent(name) + '\nEmail: ' + encodeURIComponent(email) + '\n\nMessage:\n' + encodeURIComponent(message);
        window.location.href = 'mailto:info@lucasacchi.net?subject=Contact from lucasacchi.net&body=' + body;
        var successMsg = document.getElementById('contact-success');
        if (successMsg) {
          successMsg.classList.remove('hidden');
          contactForm.reset();
          setTimeout(function() { successMsg.classList.add('hidden'); }, 5000);
        }
      });
    }
    
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function() {
        // Silent fail
      });
    }
    } // end init()

  // Start initialization
})();