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
    process.exit(1);
  }
}

function assembleDist() {
  if (existsSync(DIST)) {
    for (const entry of readdirSync(DIST)) {
      const full = join(DIST, entry);
      if (entry === 'news') continue;
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

  writeFileSync(join(DIST, 'version.txt'), APP_VERSION + '\n', 'utf-8');

  const robotsTxt = `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
  writeFileSync(join(DIST, 'robots.txt'), robotsTxt, 'utf-8');

  const sitemapEntries = feed.articles
    .filter(a => a.date)
    .map(a => `  <url>\n    <loc>${SITE_URL}/</loc>\n    <lastmod>${a.date}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`)
    .join('\n');
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${SITE_URL}/</loc>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n${sitemapEntries}\n</urlset>\n`;
  writeFileSync(join(DIST, 'sitemap.xml'), sitemapXml, 'utf-8');

  console.log(`Assembled ${DIST}/ with ${feed.articles.length} article(s)`);
}

assembleDist();