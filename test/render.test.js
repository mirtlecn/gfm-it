import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { getAsset } from 'gfm-addons';
import { getGfmAssetUrl, renderMarkdownToHtml } from '../index.js';

const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL('../cli.js', import.meta.url));

function runCliWithInput(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(input);
  });
}

test('renderMarkdownToHtml returns a complete HTML document with remote assets by default', () => {
  const html = renderMarkdownToHtml('# Hello', { title: 'Hello <World>' });

  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<html>/);
  assert.match(html, /<title>Hello &lt;World&gt;<\/title>/);
  assert.match(html, /<meta property="og:title" content="Hello &lt;World&gt;">/);
  assert.match(html, /<meta name="twitter:title" content="Hello &lt;World&gt;">/);
  assert.match(html, /<article class="markdown-body">/);
  assert.match(html, new RegExp(getAsset('ravel_gfm_css').remoteUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(html, /gfm-addons\.js/);
  assert.doesNotMatch(html, /highlight-light\.css/);
});

test('renderMarkdownToHtml uses YAML front matter for head metadata without rendering it in the article', () => {
  const html = renderMarkdownToHtml(`---
title: YAML Title
description: YAML Description
canonical: https://example.test/post
cover: https://example.test/cover.png
date: 2026-06-10
update: 2026-06-11T10:20:30Z
---
# Visible`);
  const articleHtml = html.slice(html.indexOf('<article class="markdown-body">'), html.indexOf('</article>'));

  assert.match(html, /<title>YAML Title<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.test\/post">/);
  assert.match(html, /<meta name="description" content="YAML Description">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/example\.test\/post">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/example\.test\/cover\.png">/);
  assert.match(html, /<meta property="article:published_time" content="2026-06-10">/);
  assert.match(html, /<meta property="article:modified_time" content="2026-06-11T10:20:30Z">/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/example\.test\/cover\.png">/);
  assert.match(html, /Visible/);
  assert.doesNotMatch(articleHtml, /YAML Title/);
  assert.doesNotMatch(articleHtml, /YAML Description/);
  assert.doesNotMatch(articleHtml, /canonical:/);
});

test('renderMarkdownToHtml resolves title priority from options, YAML, heading, then empty', () => {
  const optionTitleHtml = renderMarkdownToHtml('---\ntitle: YAML Title\n---\n# Heading Title', { title: 'Option Title' });
  const yamlTitleHtml = renderMarkdownToHtml('---\ntitle: YAML Title\n---\n# Heading Title');
  const headingTitleHtml = renderMarkdownToHtml('# Heading Title');
  const emptyTitleHtml = renderMarkdownToHtml('');

  assert.match(optionTitleHtml, /<title>Option Title<\/title>/);
  assert.match(yamlTitleHtml, /<title>YAML Title<\/title>/);
  assert.match(headingTitleHtml, /<title>Heading Title<\/title>/);
  assert.match(emptyTitleHtml, /<title><\/title>/);
});

test('renderMarkdownToHtml resolves canonical priority and omits URL tags when absent', () => {
  const html = renderMarkdownToHtml('---\ncanonical: https://yaml.example/post\n---\n# Hello', {
    canonical: 'https://option.example/post',
  });
  const withoutCanonical = renderMarkdownToHtml('# Hello');

  assert.match(html, /<link rel="canonical" href="https:\/\/option\.example\/post">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/option\.example\/post">/);
  assert.doesNotMatch(html, /https:\/\/yaml\.example\/post/);
  assert.doesNotMatch(withoutCanonical, /rel="canonical"/);
  assert.doesNotMatch(withoutCanonical, /property="og:url"/);
});

test('renderMarkdownToHtml resolves image priority and ignores relative Markdown images', () => {
  const coverHtml = renderMarkdownToHtml(`---
cover: https://example.test/cover.png
image: https://example.test/image.png
---
# Hello

![Body](https://example.test/body.png)`);
  const markdownImageHtml = renderMarkdownToHtml('# Hello\n\n![Body](https://example.test/body.png)');
  const relativeImageHtml = renderMarkdownToHtml('# Hello\n\n![Body](/body.png)');

  assert.match(coverHtml, /<meta property="og:image" content="https:\/\/example\.test\/cover\.png">/);
  assert.doesNotMatch(coverHtml, /https:\/\/example\.test\/image\.png/);
  assert.match(markdownImageHtml, /<meta property="og:image" content="https:\/\/example\.test\/body\.png">/);
  assert.doesNotMatch(relativeImageHtml, /og:image/);
  assert.match(relativeImageHtml, /<meta name="twitter:card" content="summary">/);
});

test('renderMarkdownToHtml uses a stable grayscale Picsum fallback image only when enabled', () => {
  const markdown = '# Hello\n\nBody without an image.';
  const defaultHtml = renderMarkdownToHtml(markdown);
  const fallbackHtml = renderMarkdownToHtml(markdown, { fallbackImage: true });
  const repeatedFallbackHtml = renderMarkdownToHtml(markdown, { fallbackImage: true });
  const yamlImageHtml = renderMarkdownToHtml('---\nimage: https://example.test/image.png\n---\n# Hello', {
    fallbackImage: true,
  });
  const imageMatch = fallbackHtml.match(/<meta property="og:image" content="(https:\/\/picsum\.photos\/seed\/[a-f0-9]{16}\/1200\/630\.jpg\?grayscale)">/);
  const repeatedImageMatch = repeatedFallbackHtml.match(/<meta property="og:image" content="(https:\/\/picsum\.photos\/seed\/[a-f0-9]{16}\/1200\/630\.jpg\?grayscale)">/);

  assert.doesNotMatch(defaultHtml, /picsum\.photos/);
  assert.ok(imageMatch);
  assert.ok(repeatedImageMatch);
  assert.equal(imageMatch[1], repeatedImageMatch[1]);
  assert.match(fallbackHtml, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(fallbackHtml, new RegExp(`<meta name="twitter:image" content="${imageMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`));
  assert.match(yamlImageHtml, /<meta property="og:image" content="https:\/\/example\.test\/image\.png">/);
  assert.doesNotMatch(yamlImageHtml, /picsum\.photos/);
});

test('renderMarkdownToHtml falls back to a 160 character plain text description', () => {
  const bodyText = `${'A'.repeat(100)} ${'B'.repeat(100)}`;
  const html = renderMarkdownToHtml(`# Title

\`\`\`js
console.log('skip me');
\`\`\`

${bodyText}`);
  const match = html.match(/<meta name="description" content="([^"]+)">/);

  assert.ok(match);
  assert.equal(match[1].length, 160);
  assert.equal(match[1], bodyText.slice(0, 160));
  assert.doesNotMatch(match[1], /skip me/);
});

test('renderMarkdownToHtml injects local TOC assets when enough headings exist', () => {
  const html = renderMarkdownToHtml('# One\n\n## Two', { assetMode: 'local' });

  assert.match(html, /href="\/asset\/gfm_addons_css"/);
  assert.match(html, /src="\/asset\/gfm_addons_js"/);
});

test('renderMarkdownToHtml injects highlight assets only for code blocks', () => {
  const html = renderMarkdownToHtml('```js\nconsole.log("hi")\n```', { assetMode: 'local' });

  assert.match(html, /href="\/asset\/highlight_light_css" media="\(prefers-color-scheme: light\)"/);
  assert.match(html, /href="\/asset\/highlight_dark_css" media="\(prefers-color-scheme: dark\)"/);
});

test('renderMarkdownToHtml supports slots, extra CSS, and body classes', () => {
  const html = renderMarkdownToHtml('# Hello', {
    extraCss: '.custom { color: red; }',
    bodyClass: 'custom-body',
    slots: {
      headEnd: '<meta name="x-test" content="1">',
      bodyStart: '<!-- raw hint -->',
      articleBefore: '<nav>before</nav>',
      articleAfter: () => '<footer>after</footer>',
      bodyEnd: '<script>window.done = true;</script>',
    },
  });

  assert.match(html, /<meta name="x-test" content="1">/);
  assert.match(html, /<body class="custom-body">/);
  assert.match(html, /<!-- raw hint -->/);
  assert.match(html, /<nav>before<\/nav>/);
  assert.match(html, /<footer>after<\/footer>/);
  assert.match(html, /\.custom \{ color: red; \}/);
});

test('renderMarkdownToHtml injects a sticky markdown footer', () => {
  const footerHtml = 'footer-e8c3a91f <a href="https://example.test/link-42">link-17b92</a>';
  const html = renderMarkdownToHtml('# One\n\n## Two', { footerHtml });
  const articleEndIndex = html.indexOf('</article>');
  const tocScriptIndex = html.indexOf('gfm-addons.js');
  const footerIndex = html.indexOf('<footer class="markdown-body post-footer">');

  assert.notEqual(footerIndex, -1);
  assert.ok(articleEndIndex < footerIndex);
  assert.ok(tocScriptIndex < footerIndex);
  assert.match(html, /min-height: 100vh;/);
  assert.match(html, /display: flex;/);
  assert.match(html, /flex-direction: column;/);
  assert.match(html, /\.post-footer \{\n    flex-shrink: 0;\n    margin-top: auto;\n    padding-top: 48px;\n    text-align: center;\n    font-size: 12px;\n  \}/);
  assert.match(html, /<footer class="markdown-body post-footer">\nfooter-e8c3a91f <a href="https:\/\/example\.test\/link-42">link-17b92<\/a>\n<\/footer>/);
});

test('renderMarkdownToHtml omits the sticky footer for blank footer HTML', () => {
  const html = renderMarkdownToHtml('# Hello', { footerHtml: '   ' });

  assert.doesNotMatch(html, /post-footer/);
  assert.doesNotMatch(html, /min-height: 100vh;/);
  assert.doesNotMatch(html, /display: flex;/);
});

test('getGfmAssetUrl supports custom resolver and local base URL', () => {
  assert.equal(
    getGfmAssetUrl('ravel_gfm_css', { assetMode: 'local', assetBaseUrl: '/static/assets' }),
    '/static/assets/ravel_gfm_css',
  );
  assert.equal(
    getGfmAssetUrl('ravel_gfm_css', { resolveAssetUrl: (asset) => `/custom/${asset.key}` }),
    '/custom/ravel_gfm_css',
  );
});

test('getGfmAssetUrl rejects unsupported asset modes', () => {
  assert.throws(
    () => getGfmAssetUrl('ravel_gfm_css', { assetMode: 'inline' }),
    /Unsupported assetMode: inline/,
  );
});

test('CLI prints help with --help and -h', async () => {
  const help = await execFileAsync(process.execPath, [cliPath, '--help']);
  const shortHelp = await execFileAsync(process.execPath, [cliPath, '-h']);

  assert.match(help.stdout, /^Usage: gfm-it \[file\] \[options\]/);
  assert.match(help.stdout, /--canonical <url>/);
  assert.match(help.stdout, /--fallback-image <true\|false>/);
  assert.match(shortHelp.stdout, /^Usage: gfm-it \[file\] \[options\]/);
});

test('CLI reads stdin when file is omitted', async () => {
  const result = await runCliWithInput(['--title', 'From stdin'], '# From stdin');

  assert.equal(result.code, 0);
  assert.match(result.stdout, /<title>From stdin<\/title>/);
  assert.match(result.stdout, /From stdin/);
  assert.equal(result.stderr, '');
});

test('CLI renders a file to an output path', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gfm-it-'));
  const input = join(directory, 'input.md');
  const output = join(directory, 'nested', 'output.html');
  await writeFile(input, '# File input');

  await execFileAsync(process.execPath, [cliPath, input, '--output', output, '--asset-mode', 'local']);
  const html = await readFile(output, 'utf8');

  assert.match(html, /File input/);
  assert.match(html, /href="\/asset\/ravel_gfm_css"/);
});

test('CLI accepts raw footer HTML', async () => {
  const result = await runCliWithInput(['--footer-html', '<strong>CLI footer</strong>'], '# From stdin');

  assert.equal(result.code, 0);
  assert.match(result.stdout, /<footer class="markdown-body post-footer">\n<strong>CLI footer<\/strong>\n<\/footer>/);
  assert.match(result.stdout, /min-height: 100vh;/);
  assert.equal(result.stderr, '');
});

test('CLI accepts a canonical URL', async () => {
  const result = await runCliWithInput(['--canonical', 'https://example.test/stdin'], '# From stdin');

  assert.equal(result.code, 0);
  assert.match(result.stdout, /<link rel="canonical" href="https:\/\/example\.test\/stdin">/);
  assert.match(result.stdout, /<meta property="og:url" content="https:\/\/example\.test\/stdin">/);
  assert.equal(result.stderr, '');
});

test('CLI accepts the fallback image boolean option', async () => {
  const result = await runCliWithInput(['--fallback-image', 'true'], '# From stdin');
  const falseResult = await runCliWithInput(['--fallback-image', 'false'], '# From stdin');

  assert.equal(result.code, 0);
  assert.match(result.stdout, /<meta property="og:image" content="https:\/\/picsum\.photos\/seed\/[a-f0-9]{16}\/1200\/630\.jpg\?grayscale">/);
  assert.match(result.stdout, /<meta name="twitter:card" content="summary_large_image">/);
  assert.equal(result.stderr, '');
  assert.equal(falseResult.code, 0);
  assert.doesNotMatch(falseResult.stdout, /picsum\.photos/);
  assert.equal(falseResult.stderr, '');
});

test('CLI rejects invalid fallback image boolean values', async () => {
  const result = await runCliWithInput(['--fallback-image', 'yes'], '# From stdin');

  assert.equal(result.code, 1);
  assert.match(result.stderr, /--fallback-image must be true or false, got: yes/);
});
