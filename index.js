export const assets = [
  {
    key: 'ravel_gfm_css',
    file: 'assets/ravel-gfm.css',
    contentType: 'text/css; charset=utf-8',
  },
  {
    key: 'whitey_gfm_css',
    file: 'assets/whitey-gfm.css',
    contentType: 'text/css; charset=utf-8',
  },
  {
    key: 'newsprint_gfm_css',
    file: 'assets/newsprint-gfm.css',
    contentType: 'text/css; charset=utf-8',
  },
  {
    key: 'github_gfm_css',
    file: 'assets/github-gfm.css',
    contentType: 'text/css; charset=utf-8',
  },
  {
    key: 'highlight_light_css',
    file: 'assets/highlight-light.css',
    contentType: 'text/css; charset=utf-8',
  },
  {
    key: 'highlight_dark_css',
    file: 'assets/highlight-dark.css',
    contentType: 'text/css; charset=utf-8',
  },
  {
    key: 'gfm_addons_css',
    file: 'assets/gfm-addons.css',
    contentType: 'text/css; charset=utf-8',
  },
  {
    key: 'gfm_addons_js',
    file: 'assets/gfm-addons.js',
    contentType: 'application/javascript; charset=utf-8',
  },
];

const assetsByKey = new Map(assets.map((asset) => [asset.key, asset]));

export function getAsset(key) {
  const asset = assetsByKey.get(key);
  if (!asset) {
    throw new Error(`Unknown GFM addon asset: ${key}`);
  }
  return asset;
}

export function getAssetPath(key) {
  return getAsset(key).file;
}

export function getAssetContentType(key) {
  return getAsset(key).contentType;
}
