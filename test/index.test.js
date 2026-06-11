import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assets, getAsset, getAssetContentType, getAssetPath } from '../index.js';

const rootDirectory = fileURLToPath(new URL('..', import.meta.url));
const expectedKeys = [
  'ravel_gfm_css',
  'highlight_light_css',
  'highlight_dark_css',
  'gfm_addons_css',
  'gfm_addons_js',
];

test('exports the expected GFM addon asset keys', () => {
  assert.deepEqual(assets.map((asset) => asset.key), expectedKeys);
});

test('manifest matches the JavaScript exports', async () => {
  const manifest = JSON.parse(await readFile(join(rootDirectory, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest, assets);
});

test('each manifest file exists in the package', () => {
  for (const asset of assets) {
    assert.equal(existsSync(join(rootDirectory, asset.file)), true, `${asset.file} should exist`);
  }
});

test('getAssetPath returns stable semantic paths', () => {
  assert.equal(getAssetPath('ravel_gfm_css'), 'assets/ravel-gfm.css');
  assert.equal(getAssetPath('highlight_light_css'), 'assets/highlight-light.css');
  assert.equal(getAssetPath('highlight_dark_css'), 'assets/highlight-dark.css');
  assert.equal(getAssetPath('gfm_addons_css'), 'assets/gfm-addons.css');
  assert.equal(getAssetPath('gfm_addons_js'), 'assets/gfm-addons.js');
});

test('getAssetContentType returns the configured content type', () => {
  assert.equal(getAssetContentType('ravel_gfm_css'), 'text/css; charset=utf-8');
  assert.equal(getAssetContentType('gfm_addons_js'), 'application/javascript; charset=utf-8');
});

test('getAsset returns the full asset record', () => {
  assert.deepEqual(getAsset('ravel_gfm_css'), {
    key: 'ravel_gfm_css',
    file: 'assets/ravel-gfm.css',
    contentType: 'text/css; charset=utf-8',
  });
});

test('unknown asset keys throw', () => {
  assert.throws(() => getAssetPath('missing'), /Unknown GFM addon asset/);
});
