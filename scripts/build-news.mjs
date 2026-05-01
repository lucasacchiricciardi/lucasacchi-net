import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, copyFileSync, rmSync, statSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { execSync } from 'node:child_process';

function copyDirectoryRecursive(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const dstPath = join(dst, entry);
    const stat = statSync(srcPath);
    if (stat.isFile()) {
      copyFileSync(srcPath, dstPath);
    } else if (stat.isDirectory()) {
      copyDirectoryRecursive(srcPath, dstPath);
    }
  }
}

const SRC_HOME = process.env.BUILD_SRC_HOME || 'src/home';
const SRC_RAW = process.env.BUILD_NEWS_SRC || 'src/raw';
const DIST = process.env.BUILD_DIST || 'dist';
const DIST_NEWS = join(DIST, 'news');
const FEED_OUTPUT = join(DIST_NEWS, 'news-feed.json');

const SITE_URL = process.env.SITE_URL || 'https://lucasacchi.net';
const APP_VERSION = process.env.BUILD_VERSION || '2.0.0';

export function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { metadata: {}, body: content.trim() };
  }
  const rawMeta = match[1];
  const body = match[2].trim();
  const metadata = {};
  for (const line of rawMeta.split('\n')) {
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    const val = line.slice(sep + 1).trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      const arrayStr = val.slice(1, -1).trim();
      if (arrayStr === '') {
        metadata[key] = [];
      } else {
        metadata[key] = arrayStr.split(',').map(s => s.trim()).filter(s => s);
      }
    } else {
      metadata[key] = val;
    }
  }
  return { metadata, body };
}

export function markdownToHtml(md) {
  if (!md) return '';
  const lines = md.split('\n');
  const blocks = [];
  let current = [];

  function flush() {
    if (current.length > 0) {
      blocks.push(current.join('\n'));
      current = [];
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      flush();
    } else if (/^#{1,3}\s/.test(trimmed)) {
      flush();
      blocks.push(trimmed);
    } else if (/^- /.test(trimmed)) {
      current.push(trimmed);
    } else {
      current.push(trimmed);
    }
  }
  flush();

  const htmlBlocks = blocks.map(function(block) {
    if (/^#{1,3}\s/.test(block)) {
      var leveled = block.replace(/^###\s+(.*)/, '<h3>$1</h3>')
        .replace(/^##\s+(.*)/, '<h2>$1</h2>')
        .replace(/^#\s+(.*)/, '<h1>$1</h1>');
      return leveled;
    }
    if (/^- /.test(block)) {
      var items = block.split('\n').map(function(l) {
        var inner = l.replace(/^- /, '');
        inner = inner.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        inner = inner.replace(/\*(.*?)\*/g, '<em>$1</em>');
        inner = inner.replace(/`(.*?)`/g, '<code>$1</code>');
        inner = inner.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
        return '<li>' + inner + '</li>';
      });
      return '<ul>' + items.join('') + '</ul>';
    }
    var p = block.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    p = p.replace(/\*(.*?)\*/g, '<em>$1</em>');
    p = p.replace(/`(.*?)`/g, '<code>$1</code>');
    p = p.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    p = p.replace(/\n/g, '<br>');
    return '<p>' + p + '</p>';
  });

  return htmlBlocks.join('\n');
}

function buildArticle(filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  const { metadata, body } = parseFrontmatter(raw);
  const id = basename(filePath, extname(filePath));
  const html = markdownToHtml(body);
  return {
    id,
    title: metadata.title || id,
    date: metadata.date || null,
    tags: Array.isArray(metadata.tags) ? metadata.tags : [],
    lang: metadata.lang || 'it',
    content: body,
    html,
  };
}

function buildNewsFeed(srcDir) {
  if (!existsSync(srcDir)) return { articles: [] };

  const files = readdirSync(srcDir)
    .filter(f => f.endsWith('.md'))
    .sort()
    .map(f => buildArticle(join(srcDir, f)));

  const sorted = files.sort((a, b) => {
    if (a.date === null && b.date === null) return 0;
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return b.date.localeCompare(a.date);
  });

  return { articles: sorted, version: APP_VERSION };
}

function groupArticlesBySlug(articles) {
  const groups = {};
  for (const article of articles) {
    const baseSlug = article.id.replace(/-en$/, '');
    if (!groups[baseSlug]) {
      groups[baseSlug] = { it: null, en: null };
    }
    if (article.lang === 'en') {
      groups[baseSlug].en = article;
    } else {
      groups[baseSlug].it = article;
    }
  }
  return groups;
}

function generateTailwindCSS() {
  const assetsDir = join(DIST, 'assets');
  if (!existsSync(assetsDir)) {
    mkdirSync(assetsDir, { recursive: true });
  }
  const tailwindOutput = join(assetsDir, 'tailwind.css');
  try {
    // Run tailwindcss via npx
    execSync(`npx tailwindcss -i ${join(SRC_HOME, 'styles', 'input.css')} -o ${tailwindOutput} --minify`, { stdio: 'inherit' });
    console.log(`Generated Tailwind CSS at ${tailwindOutput}`);
  } catch (error) {
    console.error('Failed to generate Tailwind CSS:', error.message);
  }
}

function generateArticlePage(article, template, translations, italianFallback = null, alternateArticle = null) {
  const slug = article.id.replace(/-en$/, '');
  const lang = article.lang || 'it';
  const t = translations[lang];

  // Generate excerpt (first 150 chars)
  const plainText = stripHtml(article.html || article.content);
  const excerpt = plainText.slice(0, 150).trim() + (plainText.length > 150 ? '...' : '');

  // Generate ISO date
  const dateISO = article.date || new Date().toISOString().split('T')[0];

  // Generate tags HTML
  const tagsHtml = (article.tags || [])
    .map(tag => `<span class="font-label text-[10px] uppercase tracking-widest text-on-surface-variant bg-surface-container-highest px-2 py-1">${tag}</span>`)
    .join('\n        ');

  // Generate OG tags for article tags
  const ogTags = (article.tags || [])
    .map(tag => `<meta property="article:tag" content="${tag}"/>`)
    .join('\n');

  // Canonical URL: EN articles get /blog/{slug}-en/, IT articles get /blog/{slug}/
  const canonicalUrl = lang === 'en'
    ? `https://lucasacchi.net/blog/${slug}-en/`
    : `https://lucasacchi.net/blog/${slug}/`;

  // Article URL for sharing (same as canonical)
  const articleUrl = canonicalUrl;

  // Generate hreflang links
  let hreflangLinks = '';
  if (alternateArticle) {
    const altLang = alternateArticle.lang || 'it';
    const altSlug = alternateArticle.id.replace(/-en$/, '');
    const altUrl = altLang === 'en'
      ? `https://lucasacchi.net/blog/${altSlug}-en/`
      : `https://lucasacchi.net/blog/${altSlug}/`;
    // x-default points to IT (default language)
    const defaultUrl = `https://lucasacchi.net/blog/${slug}/`;
    hreflangLinks = [
      `<link rel="alternate" hreflang="${lang}" href="${canonicalUrl}"/>`,
      `<link rel="alternate" hreflang="${altLang}" href="${altUrl}"/>`,
      `<link rel="alternate" hreflang="x-default" href="${defaultUrl}"/>`
    ].join('\n');
  }
  
  // Add i18n fallback wrapper if this is EN version and Italian fallback exists
  let contentHtml = article.html;
  if (lang === 'en' && italianFallback) {
    // Wrap content in data-i18n div with Italian fallback text
    contentHtml = `<div data-i18n-fallback="it">${italianFallback.html}</div>\n${contentHtml}`;
  } else if (lang === 'it') {
    // Italian content is the fallback
    contentHtml = `<div data-i18n-primary="it">${contentHtml}</div>`;
  }
  
  // Replace placeholders
  let html = template
    .replace(/\{\{LANG\}\}/g, lang)
    .replace(/\{\{TITLE\}\}/g, article.title)
    .replace(/\{\{SLUG\}\}/g, slug)
    .replace(/\{\{EXCERPT\}\}/g, excerpt)
    .replace(/\{\{DATE\}\}/g, article.date || '')
    .replace(/\{\{DATE_ISO\}\}/g, dateISO)
    .replace(/\{\{CONTENT_HTML\}\}/g, contentHtml)
    .replace(/\{\{TAGS_HTML\}\}/g, tagsHtml)
    .replace(/\{\{OG_TAGS\}\}/g, ogTags)
    .replace(/\{\{ARTICLE_URL\}\}/g, articleUrl)
    .replace(/\{\{CANONICAL_URL\}\}/g, canonicalUrl)
    .replace(/\{\{HREFLANG_LINKS\}\}/g, hreflangLinks)
    .replace(/\{\{BACK_TO_BLOG\}\}/g, t.backToBlog)
    .replace(/\{\{ABOUT\}\}/g, t.about)
    .replace(/\{\{CONTACT\}\}/g, t.contact)
    .replace(/\{\{COORDINATES\}\}/g, t.coordinates);
  
  return html;
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function assembleDist() {
  if (existsSync(DIST)) {
    for (const entry of readdirSync(DIST)) {
      const full = join(DIST, entry);
      if (entry === 'news' || entry === 'blog') continue;
      rmSync(full, { recursive: true, force: true });
    }
  }
  mkdirSync(DIST, { recursive: true });
  mkdirSync(DIST_NEWS, { recursive: true });

  const filesToCopy = ['index.html', 'main.js', 'newsWorker.js', 'favicon.svg', 'sw.js', 'manifest.json', 'analytics.js'];
  for (const f of filesToCopy) {
    const src = join(SRC_HOME, f);
    const dst = join(DIST, f);
    if (existsSync(src)) {
      copyFileSync(src, dst);
    } else {
      console.warn(`Warning: ${src} not found, skipping`);
    }
  }

  // Copy i18n.js from src root
  const i18nSrc = join(process.cwd(), 'src', 'i18n.js');
  const i18nDst = join(DIST, 'i18n.js');
  if (existsSync(i18nSrc)) {
    copyFileSync(i18nSrc, i18nDst);
    console.log(`Copied i18n.js to dist/`);
  } else {
    console.warn(`Warning: ${i18nSrc} not found, skipping`);
  }

  // Copy lang-switcher.js from src root
  const langSwitcherSrc = join(process.cwd(), 'src', 'lang-switcher.js');
  const langSwitcherDst = join(DIST, 'lang-switcher.js');
  if (existsSync(langSwitcherSrc)) {
    copyFileSync(langSwitcherSrc, langSwitcherDst);
    console.log(`Copied lang-switcher.js to dist/`);
  } else {
    console.warn(`Warning: ${langSwitcherSrc} not found, skipping`);
  }

  // Copy secret.json if exists
  const secretSrc = join(process.cwd(), 'src', 'secret.json');
  const secretDst = join(DIST, 'secret.json');
  if (existsSync(secretSrc)) {
    copyFileSync(secretSrc, secretDst);
    console.log('Copied secret.json to dist/');
  } else {
    console.log('secret.json not found, auth disabled');
  }


  // Copy subpages
  const subpagesDir = 'src';
  const subpages = readdirSync(subpagesDir).filter(function(entry) {
    return entry !== 'home' && entry !== 'raw' && entry !== 'vendor';
  });
  for (const sub of subpages) {
    const subSrc = join(subpagesDir, sub);
    const stat = statSync(subSrc);
    if (!stat.isDirectory()) continue;
    const indexFile = join(subSrc, 'index.html');
    if (!existsSync(indexFile)) continue;
    const subDst = join(DIST, sub);
    mkdirSync(subDst, { recursive: true });
    for (const f of readdirSync(subSrc)) {
      const srcFile = join(subSrc, f);
      const dstFile = join(subDst, f);
      const fStat = statSync(srcFile);
      if (fStat.isFile()) {
        copyFileSync(srcFile, dstFile);
      } else if (fStat.isDirectory()) {
        // Copy subdirectories (e.g., i18n/)
        copyDirectoryRecursive(srcFile, dstFile);
      }
    }
    console.log(`Copied subpage ${sub}/ to dist/${sub}/`);
  }

  // Copy vendor libraries
  const vendorSrc = 'src/vendor';
  const vendorDst = join(DIST, 'vendor');
  if (existsSync(vendorSrc)) {
    mkdirSync(vendorDst, { recursive: true });
    for (const f of readdirSync(vendorSrc)) {
      copyFileSync(join(vendorSrc, f), join(vendorDst, f));
    }
  }

  // Generate Tailwind CSS
  generateTailwindCSS();

  const feed = buildNewsFeed(SRC_RAW);
  writeFileSync(FEED_OUTPUT, JSON.stringify(feed, null, 2) + '\n', 'utf-8');

  // Generate individual article pages
  const templatePath = join('src', 'article-template.html');
  if (existsSync(templatePath)) {
    const template = readFileSync(templatePath, 'utf-8');
    const blogDir = join(DIST, 'blog');
    mkdirSync(blogDir, { recursive: true });
    
    const translations = {
      it: {
        backToBlog: 'Torna al Blog',
        about: 'Chi Sono',
        contact: 'Contattami',
        coordinates: 'Coordinates'
      },
      en: {
        backToBlog: 'Back to Blog',
        about: 'About Me',
        contact: 'Contact Me',
        coordinates: 'Coordinates'
      }
    };
    
    // Group articles by slug to pair IT/EN versions
    const articleGroups = groupArticlesBySlug(feed.articles);
    
    for (const baseSlug in articleGroups) {
      const group = articleGroups[baseSlug];
      
      // Generate Italian version (always at /blog/{slug}/)
      if (group.it) {
        const articleDir = join(blogDir, baseSlug);
        mkdirSync(articleDir, { recursive: true });

        const articleHtml = generateArticlePage(group.it, template, translations, null, group.en);
        writeFileSync(join(articleDir, 'index.html'), articleHtml, 'utf-8');
        console.log(`Generated article page: blog/${baseSlug}/index.html (IT)`);
      }

      // Generate English version (at /blog/{slug}-en/)
      if (group.en) {
        const articleDir = join(blogDir, baseSlug + '-en');
        mkdirSync(articleDir, { recursive: true });

        // Pass Italian version as fallback for SEO, and no alternate needed (IT is passed via its own call)
        const articleHtml = generateArticlePage(group.en, template, translations, group.it, group.it);
        writeFileSync(join(articleDir, 'index.html'), articleHtml, 'utf-8');
        console.log(`Generated article page: blog/${baseSlug}-en/index.html (EN)`);
      }
    }
  } else {
    console.warn(`Warning: ${templatePath} not found, skipping article page generation`);
  }

  writeFileSync(join(DIST, 'version.txt'), APP_VERSION + '\n', 'utf-8');

  const robotsTxt = `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
  writeFileSync(join(DIST, 'robots.txt'), robotsTxt, 'utf-8');

  // Generate sitemap entries for both IT and EN versions
  const articleGroups = groupArticlesBySlug(feed.articles);
  const sitemapEntries = [];
  
  for (const baseSlug in articleGroups) {
    const group = articleGroups[baseSlug];
    const date = group.it?.date || group.en?.date;
    
    if (date) {
      // IT version
      if (group.it) {
        sitemapEntries.push(`  <url>\n    <loc>${SITE_URL}/blog/${baseSlug}/</loc>\n    <lastmod>${date}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`);
      }
      
      // EN version
      if (group.en) {
        sitemapEntries.push(`  <url>\n    <loc>${SITE_URL}/blog/${baseSlug}-en/</loc>\n    <lastmod>${date}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`);
      }
    }
  }
  
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${SITE_URL}/</loc>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n${sitemapEntries.join('\n')}\n</urlset>\n`;
  writeFileSync(join(DIST, 'sitemap.xml'), sitemapXml, 'utf-8');

  console.log(`Assembled ${DIST}/ with ${feed.articles.length} article(s)`);
}

assembleDist();