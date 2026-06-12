# gfm-it

Render GitHub Flavored Markdown into a complete HTML document.

`gfm-it` owns the Markdown renderer and the HTML wrapper. Consumers still build their own business Markdown before rendering, and can use slots to inject app-specific HTML around the generated article.

## JavaScript usage

```js
import { renderMarkdownToHtml } from 'gfm-it';

const html = renderMarkdownToHtml('# Hello', {
  title: 'Hello',
  assetMode: 'remote',
});
```

Local asset mode keeps URLs compatible with servers that expose `gfm-addons` assets at `/asset/<key>`.

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
gfm-it README.md --asset-mode local --asset-base-url /asset/
gfm-it README.md --footer-html '<a href="/">Home</a>'
printf '# Hello\n' | gfm-it --title Hello
gfm-it --help
```

## API

```js
renderMarkdownToHtml(markdown, {
  title = '',
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

`assetMode: 'remote'` uses the remote asset URLs provided by `gfm-addons`. `assetMode: 'local'` emits local URLs such as `/asset/ravel_gfm_css`. `resolveAssetUrl(asset)` overrides both modes.

Slots are raw HTML strings or functions that return raw HTML. Supported slots are `headEnd`, `bodyStart`, `articleBefore`, `articleAfter`, and `bodyEnd`.

`footerHtml` is inserted as raw HTML inside `<footer class="markdown-body post-footer">`. When present, `gfm-it` applies the same sticky footer layout used by Post: the body becomes a full-height flex column, and the footer sits at the bottom with centered 12px text and 48px top padding.

The renderer includes table-of-contents assets only when the rendered document has at least two headings. Highlight CSS is included only when highlighted code blocks are present.
