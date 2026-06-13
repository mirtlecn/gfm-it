import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assets,
  getAsset,
  getAssetContentType,
  getAssetPath,
  getAssetRemoteUrl,
} from '../assets.js';
import { embeddedAssets, getEmbeddedAsset, getEmbeddedAssetContent } from '../embedded.js';
import { assetDefinitions } from '../scripts/assets.mjs';
import { createMinifiedFilePath, minifyAssetContent } from '../scripts/minify-assets.mjs';

const rootDirectory = fileURLToPath(new URL('..', import.meta.url));
const packageJson = JSON.parse(await readFile(join(rootDirectory, 'package.json'), 'utf8'));
const expectedKeys = [
  'ravel.gfm.css',
  'whitey.gfm.css',
  'newsprint.gfm.css',
  'github.gfm.css',
  'folio.gfm.css',
  'terminal.gfm.css',
  'highlight-light.css',
  'highlight-dark.css',
  'highlight-core.js',
  'gfm-addons.css',
  'gfm-addons.js',
];

function expectedRemoteUrl(filePath) {
  return `https://cdn.jsdelivr.net/npm/${packageJson.name}@${packageJson.version}/${createMinifiedFilePath(filePath)}`;
}

function splitSelectorList(selectors) {
  const items = [];
  let start = 0;
  let depth = 0;
  let quote = '';
  for (let index = 0; index < selectors.length; index += 1) {
    const char = selectors[index];
    if (quote) {
      if (char === '\\') {
        index += 1;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '(' || char === '[') {
      depth += 1;
    } else if ((char === ')' || char === ']') && depth > 0) {
      depth -= 1;
    } else if (char === ',' && depth === 0) {
      items.push(selectors.slice(start, index).trim());
      start = index + 1;
    }
  }
  items.push(selectors.slice(start).trim());
  return items.filter(Boolean);
}

function extractCssSelectors(css) {
  const selectors = new Set();
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let lastBoundary = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char !== '{' && char !== '}') {
      continue;
    }
    if (char === '{') {
      const prelude = source.slice(lastBoundary, index).trim();
      if (prelude && !prelude.startsWith('@')) {
        for (const selector of splitSelectorList(prelude)) {
          selectors.add(selector.replace(/\s+/g, ' '));
        }
      }
    }
    lastBoundary = index + 1;
  }
  return selectors;
}

test('exports the expected GFM asset keys', () => {
  assert.deepEqual(assets.map((asset) => asset.key), expectedKeys);
});

test('asset keys are generated from file names', () => {
  assert.deepEqual(
    assets.map((asset) => asset.key),
    assets.map((asset) => basename(asset.file)),
  );
  assert.equal(
    assetDefinitions.some((asset) => Object.prototype.hasOwnProperty.call(asset, 'key')),
    false,
  );
});

test('manifest matches the JavaScript asset exports', async () => {
  const manifest = JSON.parse(await readFile(join(rootDirectory, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest, assets);
});

test('embedded assets match the JavaScript asset exports', () => {
  assert.deepEqual(
    embeddedAssets.map(({ contentBase64, ...asset }) => asset),
    assets,
  );
});

test('each manifest file exists in the package source', () => {
  for (const asset of assets) {
    assert.equal(existsSync(join(rootDirectory, asset.file)), true, `${asset.file} should exist`);
  }
});

test('embedded asset content matches minified packaged files', async () => {
  for (const asset of assets) {
    const fileContent = await readFile(join(rootDirectory, asset.file));
    const minifiedContent = await minifyAssetContent(asset.file, fileContent);
    const embedded = getEmbeddedAsset(asset.key);

    assert.equal(embedded.contentBase64, minifiedContent.toString('base64'));
    assert.equal(
      Buffer.compare(getEmbeddedAssetContent(asset.key, null), minifiedContent),
      0,
      `${asset.key} embedded bytes differ from ${asset.file}`,
    );
  }
});

test('asset helpers return stable file paths, content types, and remote URLs', () => {
  assert.equal(getAssetPath('ravel.gfm.css'), 'assets/ravel.gfm.css');
  assert.equal(getAssetPath('folio.gfm.css'), 'assets/folio.gfm.css');
  assert.equal(getAssetPath('terminal.gfm.css'), 'assets/terminal.gfm.css');
  assert.equal(getAssetPath('highlight-core.js'), 'assets/highlight-core.js');
  assert.equal(getAssetContentType('ravel.gfm.css'), 'text/css; charset=utf-8');
  assert.equal(getAssetContentType('gfm-addons.js'), 'application/javascript; charset=utf-8');
  assert.equal(getAssetRemoteUrl('ravel.gfm.css'), expectedRemoteUrl('assets/ravel.gfm.css'));
  assert.equal(getAssetRemoteUrl('folio.gfm.css'), expectedRemoteUrl('assets/folio.gfm.css'));
  assert.equal(getAssetRemoteUrl('terminal.gfm.css'), expectedRemoteUrl('assets/terminal.gfm.css'));
  assert.deepEqual(getAsset('gfm-addons.js'), {
    key: 'gfm-addons.js',
    file: 'assets/gfm-addons.js',
    contentType: 'application/javascript; charset=utf-8',
    remoteUrl: expectedRemoteUrl('assets/gfm-addons.js'),
  });
});

test('unknown asset keys throw', () => {
  assert.throws(() => getAssetPath('missing'), /Unknown GFM asset/);
  assert.throws(() => getAssetRemoteUrl('missing'), /Unknown GFM asset/);
  assert.throws(() => getEmbeddedAsset('missing'), /Unknown GFM asset/);
});

test('terminal theme covers every GitHub GFM selector without remote fonts', async () => {
  const githubCss = await readFile(join(rootDirectory, 'assets/github.gfm.css'), 'utf8');
  const terminalCss = await readFile(join(rootDirectory, 'assets/terminal.gfm.css'), 'utf8');
  const githubSelectors = extractCssSelectors(githubCss);
  const terminalSelectors = extractCssSelectors(terminalCss);
  const missingSelectors = [...githubSelectors].filter((selector) => !terminalSelectors.has(selector));

  assert.deepEqual(missingSelectors, []);
  assert.doesNotMatch(terminalCss, /@import|fonts\.googleapis|staticdelivr|Fira Code/i);
  assert.doesNotMatch(terminalCss, /\.markdown-body button \{/);
  assert.doesNotMatch(terminalCss, /\.markdown-body button:not/);
  assert.equal((terminalCss.match(/^\.markdown-body \{/gm) ?? []).length, 1);
  assert.equal((terminalCss.match(/^\.markdown-body a \{/gm) ?? []).length, 1);
  assert.equal((terminalCss.match(/^\.markdown-body blockquote \{/gm) ?? []).length, 1);
  assert.equal((terminalCss.match(/^\.markdown-body hr \{/gm) ?? []).length, 1);
  assert.equal((terminalCss.match(/^\.markdown-body img \{/gm) ?? []).length, 1);
  assert.equal((terminalCss.match(/^\.markdown-body kbd \{/gm) ?? []).length, 1);
  assert.match(terminalCss, /--terminal-background: #121418;/);
  assert.match(terminalCss, /--terminal-body-foreground: #BFBDB6;/);
  assert.match(terminalCss, /\.markdown-body \{[\s\S]*color: var\(--terminal-body-foreground\);/);
  assert.match(terminalCss, /--terminal-list-indent: 1\.3ch;/);
  assert.match(terminalCss, /--terminal-ordered-list-indent: calc\(var\(--terminal-list-indent\) \+ 1\.6ch\);/);
  assert.match(terminalCss, /--terminal-list-top-item-gap: \.35em;/);
  assert.match(terminalCss, /--terminal-list-nested-gap: \.3em;/);
  assert.match(terminalCss, /--terminal-list-nested-indent: 1\.4ch;/);
  assert.match(terminalCss, /--gfm-image-frame-padding: var\(--terminal-image-frame-padding\);/);
  assert.match(terminalCss, /\.markdown-body img \{[\s\S]*box-sizing: border-box;/);
  assert.match(terminalCss, /\.markdown-body img \{[\s\S]*padding: var\(--gfm-raw-image-frame-padding, var\(--terminal-image-frame-padding\)\);/);
  assert.match(terminalCss, /\.markdown-body h1 \{\s*font-size: calc\(var\(--terminal-font-size\) \* 1\.6\);/);
  assert.match(terminalCss, /\.markdown-body h2 \{\s*font-size: calc\(var\(--terminal-font-size\) \* 1\.45\);/);
  assert.match(terminalCss, /\.markdown-body h1,[\s\S]*\.markdown-body h6 \{[\s\S]*color: var\(--terminal-foreground\);/);
  assert.doesNotMatch(terminalCss, /@media screen and \(min-width: 768px\)/);
  assert.doesNotMatch(terminalCss, /\.markdown-body h1::before/);
  assert.doesNotMatch(terminalCss, /\.markdown-body h2::before/);
  assert.match(terminalCss, /\.markdown-body blockquote \{[\s\S]*border-top: 0;[\s\S]*border-bottom: 0;/);
  assert.match(terminalCss, /\.markdown-body blockquote \{[\s\S]*color: var\(--terminal-body-foreground\);/);
  assert.doesNotMatch(terminalCss, /\.markdown-body blockquote::before/);
  assert.match(terminalCss, /\.markdown-body blockquote::after \{[\s\S]*var\(--terminal-accent\) 0 3px,[\s\S]*transparent 3px 6px/);
  assert.match(terminalCss, /\.markdown-body hr \{[\s\S]*border-top: 2px dashed var\(--terminal-accent\);/);
  assert.match(terminalCss, /\.markdown-body ul \{\s*margin-left: var\(--terminal-list-indent\);/);
  assert.match(terminalCss, /\.markdown-body ol \{\s*margin-left: var\(--terminal-ordered-list-indent\);/);
  assert.match(terminalCss, /\.markdown-body ul ul,[\s\S]*margin-top: var\(--terminal-list-nested-gap\);/);
  assert.match(terminalCss, /\.markdown-body>ul>li\+li,[\s\S]*margin-top: var\(--terminal-list-top-item-gap\);/);
});

test('GFM addons defer image enhancement without flashing theme image frames', async () => {
  const addonsCss = await readFile(join(rootDirectory, 'assets/gfm-addons.css'), 'utf8');
  const addonsJs = await readFile(join(rootDirectory, 'assets/gfm-addons.js'), 'utf8');

  assert.doesNotMatch(addonsCss, /img:not\(\.emoji\):not\(\.enhanced-content-image\)[\s\S]*opacity: 0;/);
  assert.match(addonsCss, /@media \(scripting: enabled\) \{[\s\S]*\.markdown-body \{\s*--gfm-raw-image-frame-padding: 0;\s*--gfm-raw-image-frame-border-width: 0;/);
  assert.match(addonsCss, /\.image-loading-wrap \{[\s\S]*box-sizing: border-box;[\s\S]*padding: var\(--gfm-image-frame-padding, var\(--image-frame-padding, 0\)\);/);
  assert.match(addonsCss, /\.image-loading-wrap \{[\s\S]*border: var\(--gfm-image-frame-border-width, var\(--image-frame-border-width, 1px\)\) solid var\(--gfm-image-frame-border-color, var\(--image-skeleton-border, #e5e7eb\)\);/);
  assert.match(addonsCss, /\.enhanced-content-image \{[\s\S]*padding: 0 !important;[\s\S]*border: 0 !important;/);
  assert.match(addonsCss, /\.image-loading-wrap\.is-loaded \{[\s\S]*border-color: var\(--gfm-image-frame-border-color, var\(--image-frame-border-color, transparent\)\);/);
  assert.match(addonsJs, /--image-frame-border-width/);
  assert.match(addonsJs, /--image-frame-border-color/);
  assert.match(addonsJs, /--image-frame-padding/);
});
