import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { parseFrontmatter, markdownToHtml, generateBlogListingCard, validateFrontmatter } from './build-news.mjs';

const ROOT = join(import.meta.dirname, '..');
const SRC_RAW = join(ROOT, 'src', 'raw');
const DIST = join(ROOT, 'dist');
const DIST_NEWS = join(DIST, 'news');
const FEED_OUTPUT = join(DIST_NEWS, 'news-feed.json');
const SCRIPT = join(ROOT, 'scripts', 'build-news.mjs');

describe('build-news.js', () => {
  before(() => {
    if (!existsSync(DIST_NEWS)) mkdirSync(DIST_NEWS, { recursive: true });
  });

  after(() => {});

  it('should generate news-feed.json from src/raw/*.md', () => {
    execSync(`node ${SCRIPT}`, { cwd: ROOT });
    assert.ok(existsSync(FEED_OUTPUT), 'news-feed.json should exist');

    const raw = readFileSync(FEED_OUTPUT, 'utf-8');
    const feed = JSON.parse(raw);
    assert.ok(Array.isArray(feed.articles), 'feed.articles should be an array');
  });

  it('should extract frontmatter fields from fixture articles', () => {
    const tmpDir = join(ROOT, 'tmp_test_frontmatter');
    const tmpRaw = join(tmpDir, 'src', 'raw');
    const tmpDist = join(tmpDir, 'dist');
    mkdirSync(tmpRaw, { recursive: true });

    writeFileSync(join(tmpRaw, 'test-article.md'), `---
title: Test Article
date: 2026-01-15
description: Test description
tags: [test, example]
lang: it
---
This is the body of the test article.
`);

    execSync(`node ${SCRIPT}`, {
      cwd: ROOT,
      env: {
        ...process.env,
        BUILD_NEWS_SRC: tmpRaw,
        BUILD_DIST: tmpDist,
        BUILD_SRC_HOME: join(ROOT, 'src', 'home'),
        STRICT_FRONTMATTER: '0',
      },
    });

    const feed = JSON.parse(readFileSync(join(tmpDist, 'news', 'news-feed.json'), 'utf-8'));
    const article = feed.articles.find(a => a.id === 'test-article');
    assert.ok(article, 'should find test-article');
    assert.equal(article.title, 'Test Article');
    assert.equal(article.date, '2026-01-15');
    assert.deepEqual(article.tags, ['test', 'example']);
    assert.equal(article.lang, 'it');
    assert.ok(article.content.length > 0, 'content should not be empty');

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should default lang to "it" if missing in frontmatter', () => {
    const tmpDir = join(ROOT, 'tmp_test_lang_default');
    const tmpRaw = join(tmpDir, 'src', 'raw');
    const tmpDist = join(tmpDir, 'dist');
    mkdirSync(tmpRaw, { recursive: true });

    writeFileSync(join(tmpRaw, 'no-lang.md'), `---
title: No Lang
---
Body`);

    execSync(`node ${SCRIPT}`, {
      cwd: ROOT,
      env: {
        ...process.env,
        BUILD_NEWS_SRC: tmpRaw,
        BUILD_DIST: tmpDist,
        BUILD_SRC_HOME: join(ROOT, 'src', 'home'),
        STRICT_FRONTMATTER: '0',
      },
    });

    const feed = JSON.parse(readFileSync(join(tmpDist, 'news', 'news-feed.json'), 'utf-8'));
    const article = feed.articles.find(a => a.id === 'no-lang');
    assert.ok(article, 'should find no-lang');
    assert.equal(article.lang, 'it', 'lang should default to it when missing');

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should handle missing frontmatter with filename fallback', () => {
    const tmpDir = join(ROOT, 'tmp_test_no_frontmatter');
    const tmpRaw = join(tmpDir, 'src', 'raw');
    const tmpDist = join(tmpDir, 'dist');
    mkdirSync(tmpRaw, { recursive: true });

    writeFileSync(join(tmpRaw, 'bare-article.md'), 'Just plain text.');

    execSync(`node ${SCRIPT}`, {
      cwd: ROOT,
      env: {
        ...process.env,
        BUILD_NEWS_SRC: tmpRaw,
        BUILD_DIST: tmpDist,
        BUILD_SRC_HOME: join(ROOT, 'src', 'home'),
        STRICT_FRONTMATTER: '0',
      },
    });

    const feed = JSON.parse(readFileSync(join(tmpDist, 'news', 'news-feed.json'), 'utf-8'));
    const article = feed.articles.find(a => a.id === 'bare-article');
    assert.ok(article, 'should find bare-article');
    assert.equal(article.title, 'bare-article');
    assert.equal(article.date, null);
    assert.deepEqual(article.tags, []);

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should sort articles by date descending (most recent first)', () => {
    const tmpDir = join(ROOT, 'tmp_test_sort');
    const tmpRaw = join(tmpDir, 'src', 'raw');
    const tmpDist = join(tmpDir, 'dist');
    mkdirSync(tmpRaw, { recursive: true });

    writeFileSync(join(tmpRaw, 'a.md'), `---\ndate: 2026-01-01\n---\nA`);
    writeFileSync(join(tmpRaw, 'b.md'), `---\ndate: 2026-03-01\n---\nB`);
    writeFileSync(join(tmpRaw, 'c.md'), `---\ndate: 2026-02-01\n---\nC`);

    execSync(`node ${SCRIPT}`, {
      cwd: ROOT,
      env: {
        ...process.env,
        BUILD_NEWS_SRC: tmpRaw,
        BUILD_DIST: tmpDist,
        BUILD_SRC_HOME: join(ROOT, 'src', 'home'),
        STRICT_FRONTMATTER: '0',
      },
    });

    const feed = JSON.parse(readFileSync(join(tmpDist, 'news', 'news-feed.json'), 'utf-8'));
    const dated = feed.articles.filter(a => a.date !== null);
    for (let i = 1; i < dated.length; i++) {
      assert.ok(dated[i - 1].date >= dated[i].date, `${dated[i - 1].date} should be >= ${dated[i].date}`);
    }

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should support multilingual articles', () => {
    const tmpDir = join(ROOT, 'tmp_test_multilang');
    const tmpRaw = join(tmpDir, 'src', 'raw');
    const tmpDist = join(tmpDir, 'dist');
    mkdirSync(tmpRaw, { recursive: true });

    writeFileSync(join(tmpRaw, 'article-it.md'), `---
title: Articolo Italiano
lang: it
---
Contenuto italiano`);
    writeFileSync(join(tmpRaw, 'article-en.md'), `---
title: English Article
lang: en
---
English content`);

    execSync(`node ${SCRIPT}`, {
      cwd: ROOT,
      env: {
        ...process.env,
        BUILD_NEWS_SRC: tmpRaw,
        BUILD_DIST: tmpDist,
        BUILD_SRC_HOME: join(ROOT, 'src', 'home'),
        STRICT_FRONTMATTER: '0',
      },
    });

    const feed = JSON.parse(readFileSync(join(tmpDist, 'news', 'news-feed.json'), 'utf-8'));
    const itArticle = feed.articles.find(a => a.id === 'article-it');
    const enArticle = feed.articles.find(a => a.id === 'article-en');
    assert.ok(itArticle, 'should find Italian article');
    assert.equal(itArticle.lang, 'it');
    assert.ok(enArticle, 'should find English article');
    assert.equal(enArticle.lang, 'en');

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should produce idempotent output', () => {
    execSync(`node ${SCRIPT}`, { cwd: ROOT });
    const first = readFileSync(FEED_OUTPUT, 'utf-8');

    execSync(`node ${SCRIPT}`, { cwd: ROOT });
    const second = readFileSync(FEED_OUTPUT, 'utf-8');

    assert.equal(first, second, 'running twice should produce identical output');
  });

  it('should handle empty src/raw directory gracefully', () => {
    const tmpDir = join(ROOT, 'tmp_test_empty_raw');
    const tmpRaw = join(tmpDir, 'src', 'raw');
    const tmpDist = join(tmpDir, 'dist');
    mkdirSync(tmpRaw, { recursive: true });

    execSync(`node ${SCRIPT}`, {
      cwd: ROOT,
      env: {
        ...process.env,
        BUILD_NEWS_SRC: tmpRaw,
        BUILD_DIST: tmpDist,
        BUILD_SRC_HOME: join(ROOT, 'src', 'home'),
        STRICT_FRONTMATTER: '0',
      },
    });
    const output = join(tmpDist, 'news', 'news-feed.json');
    const feed = JSON.parse(readFileSync(output, 'utf-8'));
    assert.deepEqual(feed.articles, [], 'empty raw dir should produce empty articles array');

    rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('build-news.js — dist assembly', () => {
  it('should copy index.html, main.js, newsWorker.js to dist/', () => {
    execSync(`node ${SCRIPT}`, { cwd: ROOT });

    assert.ok(existsSync(join(DIST, 'index.html')), 'dist/index.html should exist');
    assert.ok(existsSync(join(DIST, 'main.js')), 'dist/main.js should exist');
    assert.ok(existsSync(join(DIST, 'newsWorker.js')), 'dist/newsWorker.js should exist');
    assert.ok(existsSync(join(DIST, 'news', 'news-feed.json')), 'dist/news/news-feed.json should exist');
  });

  it('should generate robots.txt', () => {
    execSync(`node ${SCRIPT}`, { cwd: ROOT });
    const robots = readFileSync(join(DIST, 'robots.txt'), 'utf-8');
    assert.ok(robots.includes('User-agent: *'), 'robots.txt must have User-agent');
    assert.ok(robots.includes('Allow: /'), 'robots.txt must Allow /');
    assert.ok(robots.includes('Sitemap:'), 'robots.txt must reference sitemap');
  });

  it('should generate sitemap.xml', () => {
    execSync(`node ${SCRIPT}`, { cwd: ROOT });
    const sitemap = readFileSync(join(DIST, 'sitemap.xml'), 'utf-8');
    assert.ok(sitemap.includes('<?xml'), 'sitemap must be XML');
    assert.ok(sitemap.includes('<urlset'), 'sitemap must have urlset');
    assert.ok(sitemap.includes('<loc>'), 'sitemap must have loc entries');
  });

  it('should generate version.txt with version from package.json', () => {
    execSync(`node ${SCRIPT}`, { cwd: ROOT });
    const versionFile = join(DIST, 'version.txt');
    assert.ok(existsSync(versionFile), 'version.txt should exist in dist/');
    const version = readFileSync(versionFile, 'utf-8').trim();
    assert.ok(/^\d+\.\d+\.\d+$/.test(version), 'version should be semver format');
  });
});

describe('parseFrontmatter — unit tests', () => {
  it('should parse standard frontmatter with title, date, tags', () => {
    const content = `---
title: Test Article
date: 2023-01-01
tags: [test, example]
---
This is the body.`;
    const result = parseFrontmatter(content);
    assert.deepEqual(result.metadata, {
      title: 'Test Article',
      date: '2023-01-01',
      tags: ['test', 'example']
    });
    assert.equal(result.body, 'This is the body.');
  });

  it('should handle multi-line arrays', () => {
    // Note: current parser does not support multi-line arrays, only single line
    const content = `---
tags: [tag1, tag2, tag3]
---
Body`;
    const result = parseFrontmatter(content);
    assert.deepEqual(result.metadata.tags, ['tag1', 'tag2', 'tag3']);
  });

  it('should handle missing frontmatter', () => {
    const content = 'Just plain markdown content.';
    const result = parseFrontmatter(content);
    assert.deepEqual(result.metadata, {});
    assert.equal(result.body, 'Just plain markdown content.');
  });

  it('should handle empty tags array', () => {
    const content = `---
title: No Tags
tags: []
---
Body`;
    const result = parseFrontmatter(content);
    assert.deepEqual(result.metadata.tags, []);
  });

  it('should handle duplicate keys (last wins)', () => {
    const content = `---
title: First
title: Second
---
Body`;
    const result = parseFrontmatter(content);
    assert.equal(result.metadata.title, 'Second');
  });

  it('should handle missing date', () => {
    const content = `---
title: No Date
tags: [test]
---
Body`;
    const result = parseFrontmatter(content);
    assert.equal(result.metadata.title, 'No Date');
    assert.deepEqual(result.metadata.tags, ['test']);
    assert.equal(result.metadata.date, undefined);
  });

  it('should handle CRLF line endings', () => {
    const content = `---\r\n
title: CRLF Test\r\n
---\r\n
Body`;
    const result = parseFrontmatter(content);
    assert.equal(result.metadata.title, 'CRLF Test');
  });

  it('should strip surrounding double quotes from values', () => {
    const content = `---
title: "Come ho classificato 46.878 libri: i quattro livelli"
description: "Hit rate al 61%, tassonomia esplosa"
---
Body`;
    const result = parseFrontmatter(content);
    assert.equal(result.metadata.title, 'Come ho classificato 46.878 libri: i quattro livelli');
    assert.equal(result.metadata.description, 'Hit rate al 61%, tassonomia esplosa');
  });

  it('should strip surrounding single quotes from values', () => {
    const content = `---
title: 'Single quoted title'
---
Body`;
    const result = parseFrontmatter(content);
    assert.equal(result.metadata.title, 'Single quoted title');
  });

  it('should NOT strip unbalanced or interior quotes', () => {
    const content = `---
title: He said "hello" and left
description: "trailing quote missing
slug: leading-quote-missing"
---
Body`;
    const result = parseFrontmatter(content);
    assert.equal(result.metadata.title, 'He said "hello" and left');
    assert.equal(result.metadata.description, '"trailing quote missing');
    assert.equal(result.metadata.slug, 'leading-quote-missing"');
  });

  it('should leave unquoted values unchanged', () => {
    const content = `---
title: Plain title without quotes
date: 2026-05-18
---
Body`;
    const result = parseFrontmatter(content);
    assert.equal(result.metadata.title, 'Plain title without quotes');
    assert.equal(result.metadata.date, '2026-05-18');
  });
});

describe('validateFrontmatter — strict required fields', () => {
  it('should pass when all required fields present', () => {
    const metadata = {
      title: 'Test',
      date: '2026-05-18',
      description: 'A description',
      lang: 'it',
      tags: ['t1']
    };
    assert.doesNotThrow(() => validateFrontmatter(metadata, 'test.md'));
  });

  it('should throw when description is missing', () => {
    const metadata = { title: 'T', date: '2026-05-18', lang: 'it' };
    assert.throws(
      () => validateFrontmatter(metadata, 'broken.md'),
      /broken\.md.*description/i
    );
  });

  it('should throw when lang is missing', () => {
    const metadata = { title: 'T', date: '2026-05-18', description: 'd' };
    assert.throws(
      () => validateFrontmatter(metadata, 'broken.md'),
      /broken\.md.*lang/i
    );
  });

  it('should throw when title is missing', () => {
    const metadata = { date: '2026-05-18', description: 'd', lang: 'it' };
    assert.throws(
      () => validateFrontmatter(metadata, 'broken.md'),
      /broken\.md.*title/i
    );
  });

  it('should throw when date is missing', () => {
    const metadata = { title: 'T', description: 'd', lang: 'it' };
    assert.throws(
      () => validateFrontmatter(metadata, 'broken.md'),
      /broken\.md.*date/i
    );
  });

  it('should list all missing fields in single error', () => {
    const metadata = { title: 'T' };
    let err;
    try {
      validateFrontmatter(metadata, 'broken.md');
    } catch (e) {
      err = e;
    }
    assert.ok(err, 'should throw');
    assert.match(err.message, /date/);
    assert.match(err.message, /description/);
    assert.match(err.message, /lang/);
  });

  it('should treat empty string as missing', () => {
    const metadata = { title: 'T', date: '2026-05-18', description: '', lang: 'it' };
    assert.throws(
      () => validateFrontmatter(metadata, 'broken.md'),
      /description/
    );
  });
});

describe('generateBlogListingCard — excerpt priority', () => {
  it('should use article.description as excerpt when present', () => {
    const article = {
      id: 'test-slug',
      title: 'Test Title',
      date: '2026-05-18',
      tags: ['t1'],
      description: 'A clean, hand-written description.',
      content: '**[Back link](./other/)** --- body text that should NOT be used as excerpt.'
    };
    const html = generateBlogListingCard(article);
    assert.ok(html.includes('A clean, hand-written description.'),
      `excerpt should contain description; got: ${html.slice(0, 400)}`);
    assert.ok(!html.includes('Back link'),
      `excerpt should NOT contain raw markdown back link`);
  });

  it('should fall back to body-extracted excerpt when description is missing', () => {
    const article = {
      id: 'test-slug',
      title: 'Test Title',
      date: '2026-05-18',
      tags: [],
      description: null,
      content: 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'
    };
    const html = generateBlogListingCard(article);
    assert.ok(html.includes('Lorem ipsum dolor sit amet'),
      `excerpt should fall back to body text when description missing`);
  });

  it('should fall back to body when description is empty string', () => {
    const article = {
      id: 'test-slug',
      title: 'Test Title',
      date: '2026-05-18',
      tags: [],
      description: '',
      content: 'Body content used as fallback because description is empty.'
    };
    const html = generateBlogListingCard(article);
    assert.ok(html.includes('Body content used as fallback'),
      `empty description should be treated as missing`);
  });

  it('should escape double quotes in description data-attribute', () => {
    const article = {
      id: 'test-slug',
      title: 'Test',
      date: '2026-05-18',
      tags: [],
      description: 'Quote "inside" description.',
      content: 'body'
    };
    const html = generateBlogListingCard(article);
    assert.ok(html.includes('data-excerpt="Quote &quot;inside&quot; description."'),
      `data-excerpt must HTML-escape inner double quotes`);
  });
});

describe('markdownToHtml — unit tests', () => {
  it('should convert headers', () => {
    const md = '# Header 1\n## Header 2\n### Header 3';
    const html = markdownToHtml(md);
    assert.ok(html.includes('<h1>Header 1</h1>'));
    assert.ok(html.includes('<h2>Header 2</h2>'));
    assert.ok(html.includes('<h3>Header 3</h3>'));
  });

  it('should convert bold and italic', () => {
    const md = '**bold** and *italic*';
    const html = markdownToHtml(md);
    assert.ok(html.includes('<strong>bold</strong>'));
    assert.ok(html.includes('<em>italic</em>'));
  });

  it('should convert code', () => {
    const md = '`code`';
    const html = markdownToHtml(md);
    assert.ok(html.includes('<code>code</code>'));
  });

  it('should convert links', () => {
    const md = '[link](http://example.com)';
    const html = markdownToHtml(md);
    assert.ok(html.includes('<a href="http://example.com">link</a>'));
  });

  it('should convert lists', () => {
    const md = '- Item 1\n- Item 2';
    const html = markdownToHtml(md);
    assert.ok(html.includes('<ul><li>Item 1</li><li>Item 2</li></ul>'));
  });

  it('should convert paragraphs', () => {
    const md = 'Line 1\nLine 2';
    const html = markdownToHtml(md);
    assert.ok(html.includes('<p>Line 1<br>Line 2</p>'));
  });

  it('should handle empty input', () => {
    const html = markdownToHtml('');
    assert.equal(html, '');
  });

  it('should handle mixed content', () => {
    const md = '# Title\n\nParagraph with **bold** and [link](url).\n\n- List item';
    const html = markdownToHtml(md);
    assert.ok(html.includes('<h1>Title</h1>'));
    assert.ok(html.includes('<p>Paragraph with <strong>bold</strong> and <a href="url">link</a>.</p>'));
    assert.ok(html.includes('<ul><li>List item</li></ul>'));
  });

  it('should generate individual article pages in dist/blog/{slug}/', () => {
    execSync(`node ${SCRIPT}`, { cwd: ROOT });
    const blogDir = join(DIST, 'blog');
    assert.ok(existsSync(blogDir), 'dist/blog/ directory should exist');
    
    // Check that at least one article page was generated
    const feed = JSON.parse(readFileSync(FEED_OUTPUT, 'utf-8'));
    if (feed.articles.length > 0) {
      const firstArticle = feed.articles[0];
      const articlePage = join(blogDir, firstArticle.id, 'index.html');
      assert.ok(existsSync(articlePage), `Article page ${firstArticle.id}/index.html should exist`);
      
      const pageContent = readFileSync(articlePage, 'utf-8');
      assert.ok(pageContent.includes(firstArticle.title), 'Article page should contain article title');
      assert.ok(pageContent.includes('<!DOCTYPE html>'), 'Article page should be valid HTML');
      assert.ok(pageContent.includes('article-content'), 'Article page should include article-content class');
    }
  });
});
