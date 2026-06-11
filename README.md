# gfm-addons

Static assets for GitHub Flavored Markdown rendering.

This package ships CSS and JavaScript files for consumers that render GFM documents. It does not fetch remote assets during install or build. Update files in `assets/` directly and publish a new package version when assets change.

## JavaScript usage

```js
import { assets, getAssetPath, getAssetContentType } from 'gfm-addons';

console.log(getAssetPath('ravel_gfm_css'));
console.log(getAssetContentType('ravel_gfm_css'));
console.log(assets);
```

`manifest.json` contains the same asset metadata for non-JavaScript consumers.

## Go usage

This repository is also a Go module. The Go package embeds `manifest.json` and `assets/*` so Go consumers can read the same files from `gfmaddons.FS`.

```go
asset, ok := gfmaddons.GetAsset("ravel_gfm_css")
content, asset, err := gfmaddons.ReadAsset("ravel_gfm_css")
```

## Assets

- `ravel_gfm_css` -> `assets/ravel-gfm.css`
- `whitey_gfm_css` -> `assets/whitey-gfm.css`
- `newsprint_gfm_css` -> `assets/newsprint-gfm.css`
- `github_gfm_css` -> `assets/github-gfm.css`
- `highlight_light_css` -> `assets/highlight-light.css`
- `highlight_dark_css` -> `assets/highlight-dark.css`
- `gfm_addons_css` -> `assets/gfm-addons.css`
- `gfm_addons_js` -> `assets/gfm-addons.js`
