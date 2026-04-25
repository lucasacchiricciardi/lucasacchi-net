// i18n system
import { translations as it } from './it.js';
import { translations as en } from './en.js';

// Translation cache
const translationCache = new Map();

// Get translations for a specific language
export function getTranslations(lang) {
  if (translationCache.has(lang)) {
    return translationCache.get(lang);
  }
  
  switch(lang) {
    case 'en':
      translationCache.set(lang, en);
      return en;
    case 'it':
    default:
      translationCache.set(lang, it);
      return it;
  }
}

// Translation function with fallback
export function t(key, lang, fallback = '') {
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
export function initI18n(lang) {
  return getTranslations(lang);
}

// Clear translation cache
export function clearTranslationCache() {
  translationCache.clear();
}