# gfm-it

Render GitHub Flavored Markdown into a complete HTML document.

`gfm-it` owns the Markdown renderer and the HTML wrapper. Consumers still build their own business Markdown before rendering, and can use slots to inject app-specific HTML around the generated article.

## JavaScript usage

```js
import { renderMarkdownToHtml } from 'gfm-it';

const html = renderMarkdownToHtml('# Hello', {
  title: 'Hello',
  canonical: 'https://example.com/hello',
  fallbackImage: true,
  assetMode: 'remote',
});
```

Local asset mode keeps URLs compatible with servers that expose GFM assets at `/asset/<key>`.

```js
const html = renderMarkdownToHtml('# Hello', {
  assetMode: 'local',
  assetBaseUrl: '/asset/',
  footerHtml: 'Powered by Post',
  slots: {
    bodyStart: '<!-- hint: append ?raw to view the raw file -->',
  },
});
```

## CLI usage

```bash
gfm-it README.md --title README --output README.html
gfm-it README.md --canonical https://example.com/readme
gfm-it README.md --fallback-image true
gfm-it README.md --asset-mode local --asset-base-url /asset/
gfm-it README.md --footer-html '<a href="/">Home</a>'
printf '# Hello\n' | gfm-it --title Hello
gfm-it --help
```

## API

```js
renderMarkdownToHtml(markdown, {
  title = '',
  canonical = '',
  fallbackImage = false,
  css = 'ravel_gfm_css',
  assetMode = 'remote',
  assetBaseUrl = '/asset/',
  resolveAssetUrl,
  slots = {},
  extraCss = '',
  bodyClass = '',
  footerHtml = '',
} = {})
```

`gfm-it` automatically derives lightweight SEO metadata from YAML front matter and the Markdown body. YAML front matter is never rendered in the article.

- Title: `title` option, then `yaml.title`, then the first Markdown heading.
- Canonical URL: `canonical` option, then `yaml.canonical`; when present, emits canonical and `og:url`.
- Image: `yaml.cover`, then `yaml.image`, then the first absolute `http(s)` Markdown image; when present, emits OpenGraph and Twitter image tags.
- Fallback image: when `fallbackImage` is `true` and no image is found, emits a stable grayscale Picsum image based on the document metadata.
- Description: `yaml.description`, then `yaml.summary`, then body plain text truncated to 160 characters.
- Dates: `yaml.date` emits `article:published_time`; `yaml.update` emits `article:modified_time`.

The generated head includes key OpenGraph and Twitter Card tags: `og:type`, `og:title`, `og:description`, `og:url`, `og:image`, `twitter:card`, `twitter:title`, `twitter:description`, and `twitter:image` when their source data is available.

`assetMode: 'remote'` uses versioned jsDelivr URLs for files shipped by `gfm-it`. `assetMode: 'local'` emits local URLs such as `/asset/ravel_gfm_css`. `resolveAssetUrl(asset)` overrides both modes.

Slots are raw HTML strings or functions that return raw HTML. Supported slots are `headEnd`, `bodyStart`, `articleBefore`, `articleAfter`, and `bodyEnd`.

`footerHtml` is inserted as raw HTML inside `<footer class="markdown-body post-footer">`. When present, `gfm-it` applies the same sticky footer layout used by Post: the body becomes a full-height flex column, and the footer sits at the bottom with centered 12px text and 48px top padding.

The renderer includes table-of-contents assets only when the rendered document has at least two headings. Highlight CSS is included only when highlighted code blocks are present.

## Asset usage

`gfm-it` ships the GFM CSS and JavaScript assets directly. Consumers can import metadata, remote URLs, or embedded file content from the same package.

```js
import {
  assets,
  getAsset,
  getAssetPath,
  getAssetContentType,
  getAssetRemoteUrl,
} from 'gfm-it';
import { getEmbeddedAssetContent } from 'gfm-it/embedded';

console.log(getAssetRemoteUrl('ravel_gfm_css'));
console.log(getEmbeddedAssetContent('gfm_addons_js'));
console.log(assets);
```

`gfm-it/manifest.json` contains the same asset metadata, and `gfm-it/assets/*` exposes the raw packaged files for CDN and package subpath consumers.

## Go usage

This repository is also a Go module. The Go package embeds `manifest.json` and `assets/*` so Go consumers can read the same asset metadata and files.

```go
asset, ok := gfmit.GetAsset("ravel_gfm_css")
content, asset, err := gfmit.ReadAsset("ravel_gfm_css")
```
