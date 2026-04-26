// Browser-compatible i18n system
// Load translations
const itTranslations = {
  nav: {
    home: "Home",
    chiSono: "Chi Sono", 
    corsi: "Corsi",
    blog: "Blog",
    theLinuxFormula: "The Linux Formula",
    contattami: "Contattami",
    videos: "Video"
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
  
  article: {
    readMore: "Leggi di più",
    backToBlog: "Torna al Blog",
    shareOn: "Condividi su",
    copyLink: "Copia link"
  },
  
  externalVectors: {
    linkedin: "LinkedIn",
    youtube: "YouTube"
  },
  
  footer: {
    send: "Send Message",
    messageSent: "Message sent! I'll get back to you soon.",
    copyright: "© LucaSacchi.net.",
    allRightsReserved: "All Rights Reserved.",
    analytics: "Analytics: anonymous, cookie-free",
    coordinates: "Coordinates",
    commLinks: "Comm_Links"
  },
  
  videos: {
    clickToPlay: "Clicca su una scheda per aprire il video.",
    technicalWriting: "Technical Writing per Sviluppatori",
    proxmox: "Proxmox VE",
    debian: "Debian 11",
    linuxMint: "Linux Mint",
    // Technical Writing summaries
    tw1s: "Docs as Code & DDLC - Trattare la documentazione come il codice sorgente. Il processo DDLC.",
    tw2s: "Markdown - Lo strumento che dà voce al codice. Alternativa leggera a Word.",
    tw3s: "Diataxis Framework - Organizzare la documentazione: tutorial, how-to, reference.",
    tw4s: "Toolchain - Configurazione ambiente: linting, MkDocs, validazione link e CI/CD.",
    tw5s: "Collaborative Flow - Workflow collaborativo: branching, PR, gestione conflitti.",
    tw6s: "Style Guide - Le 3 C della scrittura: Chiarezza, Concisione, Coerenza.",
    tw7s: "CI/CD - Automazione con GitHub Actions: build, test e deploy automatico.",
    tw8s: "Versioning - La documentazione come un giardino: gestione versioni.",
    // Proxmox summaries
    px1s: "Containers - Introduzione ed uso dei container in Proxmox VE.",
    px2s: "Virtualswitch - Come creare un virtualswitch isolato in Proxmox.",
    px3s: "LXC Import - Importare container Linux Mint in Proxmox con un hack.",
    px4s: "Qemu Guest Agent - Installare su Debian 11 in Proxmox per migliorare l'integrazione.",
    px5s: "Rete Fix - Risolvere problema riavvio rete in ProxMox.",
    // Debian summaries
    db1s: "OpenVPN Access Server - Installare e configurare OpenVPN su Debian 11.",
    db2s: "Virtualbox Rete - I tipi di rete di Virtualbox spiegati.",
    db3s: "SSH Server - Come abilitare OpenSSH Server in Debian 11.",
    db4s: "Chrome SSH - Collegarsi a un server Linux da Chrome.",
    db5s: "Repository - Come abilitare i repository ufficiali.",
    db6s: "CONKY - Installare e tenere sotto controllo il sistema.",
    // Linux Mint summaries
    lm1s: "Filesystem - Comandi per manipolare file e cartelle da terminale.",
    lm2s: "Webmin - Amministrare Linux Mint via web.",
    lm3s: "NFS - Condividere le cartelle in rete.",
    lm4s: "SSH/SFTP - Installare SnowFlake SSH/SFTP.",
    lm5s: "Aggiornamento - Aggiornare da 20.01 a 20.03.",
    lm6s: "Journalctl - Gestione logs con journalctl e systemctl.",
    // Development summaries
    dev1s: "Formare programmatori - Come l'IA sta cambiando la formazione. Il valore si sposta sul 'perché'.",
    development: "Development"
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
    theLinuxFormula: "The Linux Formula",
    contattami: "Contact Me",
    videos: "Video"
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
  
  article: {
    readMore: "Read more",
    backToBlog: "Back to Blog",
    shareOn: "Share on",
    copyLink: "Copy link"
  },
  
  externalVectors: {
    linkedin: "LinkedIn",
    youtube: "YouTube"
  },
  
  footer: {
    send: "Send Message",
    messageSent: "Message sent! I'll get back to you soon.",
    copyright: "© LucaSacchi.net.",
    allRightsReserved: "All Rights Reserved.",
    analytics: "Analytics: anonymous, cookie-free",
    coordinates: "Coordinates",
    commLinks: "Comm_Links"
  },
  
  videos: {
    clickToPlay: "Click on a card to open the video.",
    technicalWriting: "Technical Writing for Developers",
    proxmox: "Proxmox VE",
    debian: "Debian 11",
    linuxMint: "Linux Mint",
    // Technical Writing summaries
    tw1s: "Docs as Code & DDLC - Treat documentation as source code. The DDLC process.",
    tw2s: "Markdown - The tool that gives voice to code. Lightweight alternative to Word.",
    tw3s: "Diataxis Framework - Document organization: tutorials, how-to, reference.",
    tw4s: "Toolchain - Environment setup: linting, MkDocs, link validation and CI/CD.",
    tw5s: "Collaborative Flow - Collaborative workflow: branching, PR, conflict handling.",
    tw6s: "Style Guide - The 3 C's of writing: Clarity, Concision, Consistency.",
    tw7s: "CI/CD - Automation with GitHub Actions: build, test and auto deploy.",
    tw8s: "Versioning - Documentation as a garden: version management.",
    // Proxmox summaries
    px1s: "Containers - Introduction and use of containers in Proxmox VE.",
    px2s: "Virtualswitch - How to create an isolated virtualswitch in Proxmox.",
    px3s: "LXC Import - Import Linux Mint container into Proxmox with a hack.",
    px4s: "Qemu Guest Agent - Install on Debian 11 in Proxmox to improve integration.",
    px5s: "Rete Fix - Solve network restart problem in ProxMox.",
    // Debian summaries
    db1s: "OpenVPN Access Server - Install and configure OpenVPN on Debian 11.",
    db2s: "Virtualbox Rete - Virtualbox network types explained.",
    db3s: "SSH Server - How to enable OpenSSH Server in Debian 11.",
    db4s: "Chrome SSH - Connect to a Linux server from Chrome.",
    db5s: "Repository - How to enable official repositories.",
    db6s: "CONKY - Install and monitor your system.",
    // Linux Mint summaries
    lm1s: "Filesystem - Commands to manipulate files and folders from terminal.",
    lm2s: "Webmin - Administer Linux Mint via web.",
    lm3s: "NFS - Share folders over the network.",
    lm4s: "SSH/SFTP - Install SnowFlake SSH/SFTP.",
    lm5s: "Update - Update from 20.01 to 20.03.",
    lm6s: "Journalctl - Manage logs with journalctl and systemctl.",
    // Development summaries
    dev1s: "Programming Training - How AI is changing programmer training. Value shifts to the 'why'.",
    development: "Development"
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
