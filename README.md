# gfm-it

Render GitHub Flavored Markdown into a complete HTML document.

The package ships both the renderer and the GFM assets. Use `local` assets when a server exposes `/asset/<key>`, and `inline` assets when the HTML should stand alone.

## CLI

```bash
# CLI defaults to inline assets, so the output HTML can be opened directly.
gfm-it README.md --title README --output README.html

# SEO metadata.
gfm-it post.md \
  --canonical https://example.com/post \
  --fallback-image true \
  --output post.html

# Use server-hosted assets instead of inline assets.
gfm-it post.md --asset-mode local --asset-base-url /asset/ --output post.html

# Use CDN assets.
gfm-it post.md --asset-mode remote --output post.html

# Read from stdin.
printf '# Hello\n' | gfm-it --title Hello
```

## JavaScript

```js
import { renderMarkdownToHtml } from 'gfm-it';

const html = renderMarkdownToHtml('# Hello', {
  title: 'Hello',
  canonical: 'https://example.com/hello',
  fallbackImage: true,

  // API default: remote. CLI default: inline.
  assetMode: 'remote',
});
```

```js
const html = renderMarkdownToHtml(markdown, {
  // Self-contained HTML: CSS and JS are inserted as <style> and <script>.
  assetMode: 'inline',
});
```

```js
const html = renderMarkdownToHtml(markdown, {
  // Compatible with servers that expose packaged assets at /asset/<key>.
  assetMode: 'local',
  assetBaseUrl: '/asset/',

  // Raw HTML insertion points around the generated article.
  slots: {
    headEnd: '<meta name="robots" content="index,follow">',
    bodyStart: '<!-- hint: append ?raw to view the raw file -->',
    articleBefore: '<nav><a href="/">Home</a></nav>',
    articleAfter: '<hr>',
    bodyEnd: '<script>console.log("done")</script>',
  },

  extraCss: '.markdown-body { scroll-margin-top: 2rem; }',
  bodyClass: 'post-page',
  footerHtml: '<a href="/">Home</a>',
});
```

```js
const html = renderMarkdownToHtml(markdown, {
  // Resolver wins over assetMode and assetBaseUrl.
  resolveAssetUrl(asset) {
    return `/static/gfm/${asset.key}`;
  },
});
```

## Go

```go
package main

import gfmit "github.com/mirtlecn/gfm-it"

func render(markdown string) (string, error) {
    return gfmit.RenderMarkdownToHTML(markdown, gfmit.RenderOptions{
        Title:         "Hello",
        Canonical:     "https://example.com/hello",
        FallbackImage: true,

        // Go API default: remote.
        AssetMode: "remote",
    })
}
```

```go
html, err := gfmit.RenderMarkdownToHTML(markdown, gfmit.RenderOptions{
    // Match a server route such as /asset/ravel_gfm_css.
    AssetMode:    "local",
    AssetBaseURL: "/asset/",

    Slots: gfmit.RenderSlots{
        HeadEnd:   `<meta name="robots" content="index,follow">`,
        BodyStart: `<!-- hint: append ?raw to view the raw file -->`,
    },
    ExtraCSS:   `.markdown-body { scroll-margin-top: 2rem; }`,
    BodyClass:  "post-page",
    FooterHTML: `<a href="/">Home</a>`,
})
```

```go
html, err := gfmit.RenderMarkdownToHTML(markdown, gfmit.RenderOptions{
    // Self-contained HTML.
    AssetMode: "inline",
})
```

```go
html, err := gfmit.RenderMarkdownToHTML(markdown, gfmit.RenderOptions{
    // Resolver wins over AssetMode and AssetBaseURL.
    ResolveAssetURL: func(asset gfmit.Asset) (string, error) {
        return "/static/gfm/" + asset.Key, nil
    },
})
```

## Assets

Files under `assets/` are shipped in their source format. Remote mode points at jsDelivr `.min.css` and `.min.js` URLs, and embedded/inline assets are minified during the build without rewriting the source files.

```js
import {
  assets,
  getAsset,
  getAssetPath,
  getAssetContentType,
  getAssetRemoteUrl,
} from 'gfm-it';
import { getEmbeddedAssetContent } from 'gfm-it/embedded';

console.log(getAsset('ravel_gfm_css'));
console.log(getAssetRemoteUrl('gfm_addons_js'));
console.log(getEmbeddedAssetContent('highlight_js'));
```

```go
asset, ok := gfmit.GetAsset("ravel_gfm_css")
content, asset, err := gfmit.ReadAsset("ravel_gfm_css")
allAssets := gfmit.Assets()
```

## Metadata

```md
---
title: YAML Title
description: Short summary for search previews.
canonical: https://example.com/posts/yaml-title
cover: https://example.com/cover.png
date: 2026-06-10
update: 2026-06-11T10:20:30Z
---

# Visible Heading

Article body.
```

```js
renderMarkdownToHtml(markdown, {
  // Priority: option title > YAML title > first Markdown heading > empty.
  title: 'Option Title',

  // Priority: option canonical > YAML canonical.
  canonical: 'https://example.com/override',

  // If no YAML cover/image or absolute Markdown image exists,
  // emit a stable grayscale Picsum social image.
  fallbackImage: true,
});
```

| Output | Source |
| --- | --- |
| `<title>` | option `title`, YAML `title`, first heading |
| canonical / `og:url` | option `canonical`, YAML `canonical` |
| description / `og:description` | YAML `description`, YAML `summary`, body text |
| `og:image` / `twitter:image` | YAML `cover`, YAML `image`, first absolute Markdown image, fallback image |
| `article:published_time` | YAML `date` |
| `article:modified_time` | YAML `update` |

## Options

```js
renderMarkdownToHtml(markdown, {
  title: '',
  canonical: '',
  fallbackImage: false,
  css: 'ravel_gfm_css',
  assetMode: 'remote', // remote | local | inline
  assetBaseUrl: '/asset/',
  resolveAssetUrl: undefined,
  slots: {},
  extraCss: '',
  bodyClass: '',
  footerHtml: '',
});
```

```go
gfmit.RenderOptions{
    Title:         "",
    Canonical:     "",
    FallbackImage: false,
    CSS:           "ravel_gfm_css",
    AssetMode:     "remote", // remote | local | inline
    AssetBaseURL:  "/asset/",
    ResolveAssetURL: nil,
    Slots:         gfmit.RenderSlots{},
    ExtraCSS:      "",
    BodyClass:     "",
    FooterHTML:    "",
}
```

Dynamic assets:

| Trigger | Assets |
| --- | --- |
| always | selected base CSS |
| at least two headings | `gfm_addons_css`, `gfm_addons_js` |
| code block | highlight light/dark CSS; Go also injects `highlight_js` |
| display math | KaTeX CSS |

Go uses `goldmark`, GFM, footnotes, GitHub alert callouts, KaTeX, and unsafe raw HTML rendering. The wrapper options match the JavaScript API; parser output is not guaranteed to be byte-for-byte identical.
