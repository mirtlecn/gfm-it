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
  assert.match(html, /<article class="markdown-body">/);
  assert.match(html, new RegExp(getAsset('ravel_gfm_css').remoteUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(html, /gfm-addons\.js/);
  assert.doesNotMatch(html, /highlight-light\.css/);
});

test('renderMarkdownToHtml strips YAML front matter before rendering', () => {
  const html = renderMarkdownToHtml('---\ntitle: Hidden\n---\n# Visible');

  assert.match(html, /Visible/);
  assert.doesNotMatch(html, /title: Hidden/);
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
