// Browser-compatible i18n system
// Load translations
const itTranslations = {
  nav: {
    home: "Home",
    chiSono: "Chi Sono", 
    corsi: "Corsi",
    blog: "Blog",
    contattami: "Contattami"
  },
  
  hero: {
    protocol: "SysAdmin_Protocol_v2.4",
    scopriCorsi: "Scopri i Corsi",
    contattami: "Contattami"
  },
  
  sections: {
    subjectMatterExpert: "Subject Matter Expert",
    latestInsights: "Latest Insights", 
    broadcastChannel: "Broadcast Channel"
  },
  
  expert: {
    experience: "Experience",
    specialty: "Specialty",
    roleLabel: "Role"
  },
  
  status: {
    searchArticles: "Search articles",
    noArticlesFound: "No articles found for this language",
    articlesNotFound: "No articles available in this language"
  },
  
  externalVectors: {
    linkedin: "LinkedIn",
    youtube: "YouTube"
  },
  
  footer: {
    send: "Send Message",
    messageSent: "Message sent! I'll get back to you soon.",
    copyright: "© The Linux Formula.",
    allRightsReserved: "All Rights Reserved.",
    analytics: "Analytics: anonymous, cookie-free"
  },
  
  meta: {
    genericError: "An error occurred. Please refresh the page.",
    failedToInitializeNews: "Failed to initialize news. Please refresh the page.",
    unableToLoadNews: "Unable to load news feed. Please refresh.",
    newsUnavailable: "News temporarily unavailable. Please try again later."
  }
};

const enTranslations = {
  nav: {
    home: "Home",
    chiSono: "About Me",
    corsi: "Courses", 
    blog: "Blog",
    contattami: "Contact Me"
  },
  
  hero: {
    protocol: "SysAdmin_Protocol_v2.4",
    scopriCorsi: "Discover Courses",
    contattami: "Contact Me"
  },
  
  sections: {
    subjectMatterExpert: "Subject Matter Expert",
    latestInsights: "Latest Insights", 
    broadcastChannel: "Broadcast Channel"
  },
  
  expert: {
    experience: "Experience",
    specialty: "Specialty",
    roleLabel: "Role"
  },
  
  status: {
    searchArticles: "Search articles",
    noArticlesFound: "No articles found for this language",
    articlesNotFound: "No articles available in this language"
  },
  
  externalVectors: {
    linkedin: "LinkedIn",
    youtube: "YouTube"
  },
  
  footer: {
    send: "Send Message",
    messageSent: "Message sent! I'll get back to you soon.",
    copyright: "© The Linux Formula.",
    allRightsReserved: "All Rights Reserved.",
    analytics: "Analytics: anonymous, cookie-free"
  },
  
  meta: {
    genericError: "An error occurred. Please refresh the page.",
    failedToInitializeNews: "Failed to initialize news. Please refresh the page.",
    unableToLoadNews: "Unable to load news feed. Please refresh.",
    newsUnavailable: "News temporarily unavailable. Please try again later."
  }
};

// Translation cache
const translationCache = new Map();

// Get translations for a specific language
function getTranslations(lang) {
  if (translationCache.has(lang)) {
    return translationCache.get(lang);
  }
  
  switch(lang) {
    case 'en':
      translationCache.set(lang, enTranslations);
      return enTranslations;
    case 'it':
    default:
      translationCache.set(lang, itTranslations);
      return itTranslations;
  }
}

// Translation function with fallback
function t(key, lang, fallback = '') {
  try {
    const translations = getTranslations(lang);
    const keys = key.split('.');
    let value = translations;
    
    for (const k of keys) {
      value = value?.[k];
    }
    
    // Return value if found, fallback if provided, or key itself as fallback
    return value !== undefined ? value : (fallback || key);
  } catch (error) {
    console.warn(`Translation key "${key}" not found for language "${lang}"`);
    return fallback || key;
  }
}

// Initialize translations
function initI18n(lang) {
  return getTranslations(lang);
}

// Clear translation cache
function clearTranslationCache() {
  translationCache.clear();
}

// Expose to global scope
window.i18n = {
  t: t,
  initI18n: initI18n,
  clearTranslationCache: clearTranslationCache
};