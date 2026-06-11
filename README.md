# gfm-addons

Static assets for GitHub Flavored Markdown rendering.

This package ships the CSS and JavaScript files needed by consumers that render GFM documents. It does not fetch remote assets during install or build. Update the files in `assets/` directly and publish a new package version when the assets change.

## Usage

```js
import { assets, getAssetPath, getAssetContentType } from 'gfm-addons';

console.log(getAssetPath('ravel_gfm_css'));
console.log(getAssetContentType('ravel_gfm_css'));
console.log(assets);
```

`manifest.json` contains the same asset metadata for non-JavaScript consumers.

## Assets

- `ravel_gfm_css` -> `assets/ravel-gfm.css`
- `highlight_light_css` -> `assets/highlight-light.css`
- `highlight_dark_css` -> `assets/highlight-dark.css`
- `gfm_addons_css` -> `assets/gfm-addons.css`
- `gfm_addons_js` -> `assets/gfm-addons.js`
