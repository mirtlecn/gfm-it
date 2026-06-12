import { marked } from 'marked';
import markedAlert from 'marked-alert';
import markedFootnote from 'marked-footnote';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import { getAsset } from 'gfm-addons';

const defaultCssAssetKey = 'ravel_gfm_css';
const defaultAssetMode = 'remote';
const defaultAssetBaseUrl = '/asset/';
const darkBackgroundColor = '#0d1117';

marked.use(
  { gfm: true, breaks: false },
  markedAlert(),
  markedFootnote(),
  gfmHeadingId(),
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    },
  }),
);

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function stripFrontMatter(markdown) {
  return String(markdown).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

function joinAssetBaseUrl(assetBaseUrl, key) {
  if (!assetBaseUrl) {
    return key;
  }
  return assetBaseUrl.endsWith('/') ? `${assetBaseUrl}${key}` : `${assetBaseUrl}/${key}`;
}

function normalizeAssetOptions(options = {}) {
  return {
    assetMode: options.assetMode || defaultAssetMode,
    assetBaseUrl: options.assetBaseUrl ?? defaultAssetBaseUrl,
    resolveAssetUrl: options.resolveAssetUrl,
  };
}

function renderSlot(slots, name, context) {
  const value = slots?.[name];
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'function') {
    const rendered = value(context);
    return rendered === undefined || rendered === null ? '' : String(rendered);
  }
  return String(value);
}

function countHeadings(htmlBody) {
  return (htmlBody.match(/<h[1-6]\b/gi) || []).length;
}

function hasHighlightedCode(htmlBody) {
  return htmlBody.includes('<code class="hljs language-') || htmlBody.includes('<code class="language-');
}

function stylesheetLink(href, media = '') {
  const mediaAttribute = media ? ` media="${escapeHtml(media)}"` : '';
  return `<link rel="stylesheet" href="${escapeHtml(href)}"${mediaAttribute}>`;
}

function scriptTag(src) {
  return `<script src="${escapeHtml(src)}"></script>`;
}

function bodyClassAttribute(bodyClass) {
  return bodyClass ? ` class="${escapeHtml(bodyClass)}"` : '';
}

function normalizeFooterHtml(footerHtml) {
  if (footerHtml === undefined || footerHtml === null) {
    return '';
  }
  return String(footerHtml).trim();
}

function renderFooterMarkup(footerHtml) {
  return footerHtml ? `<footer class="markdown-body post-footer">
${footerHtml}
</footer>` : '';
}

export function getGfmAssetUrl(key, options = {}) {
  const asset = getAsset(key);
  const { assetMode, assetBaseUrl, resolveAssetUrl } = normalizeAssetOptions(options);

  if (typeof resolveAssetUrl === 'function') {
    const resolved = resolveAssetUrl(asset);
    if (typeof resolved !== 'string' || resolved.length === 0) {
      throw new Error(`resolveAssetUrl must return a non-empty string for asset: ${key}`);
    }
    return resolved;
  }

  if (assetMode === 'local') {
    return joinAssetBaseUrl(assetBaseUrl, asset.key);
  }

  if (assetMode === 'remote') {
    if (!asset.remoteUrl) {
      throw new Error(`Remote URL is not configured for GFM asset: ${key}`);
    }
    return asset.remoteUrl;
  }

  throw new Error(`Unsupported assetMode: ${assetMode}`);
}

export function renderMarkdownToHtml(markdown, options = {}) {
  try {
    const {
      title = '',
      css = defaultCssAssetKey,
      slots = {},
      extraCss = '',
      bodyClass = '',
      footerHtml = '',
    } = options;
    const assetOptions = normalizeAssetOptions(options);
    const htmlBody = marked.parse(stripFrontMatter(markdown));
    const normalizedFooterHtml = normalizeFooterHtml(footerHtml);
    const headingCount = countHeadings(htmlBody);
    const codeBlocksPresent = hasHighlightedCode(htmlBody);
    const headLinks = [stylesheetLink(getGfmAssetUrl(css, assetOptions))];
    const bodyScripts = [];

    if (headingCount >= 2) {
      headLinks.push(stylesheetLink(getGfmAssetUrl('gfm_addons_css', assetOptions)));
      bodyScripts.push(scriptTag(getGfmAssetUrl('gfm_addons_js', assetOptions)));
    }

    if (codeBlocksPresent) {
      headLinks.push(stylesheetLink(getGfmAssetUrl('highlight_light_css', assetOptions), '(prefers-color-scheme: light)'));
      headLinks.push(stylesheetLink(getGfmAssetUrl('highlight_dark_css', assetOptions), '(prefers-color-scheme: dark)'));
    }

    const context = {
      title,
      css,
      htmlBody,
      headingCount,
      codeBlocksPresent,
      footerHtml: normalizedFooterHtml,
      footerEnabled: Boolean(normalizedFooterHtml),
      assetMode: assetOptions.assetMode,
      assetBaseUrl: assetOptions.assetBaseUrl,
    };
    const footerStyle = normalizedFooterHtml ? `
  .post-footer {
    flex-shrink: 0;
    margin-top: auto;
    padding-top: 48px;
    text-align: center;
    font-size: 12px;
  }` : '';
    const footerMarkup = renderFooterMarkup(normalizedFooterHtml);
    const extraCssBlock = extraCss ? `\n${extraCss}\n` : '';

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, minimal-ui">
<title>${escapeHtml(title)}</title>
${headLinks.join('\n')}
<style>
  body {
    box-sizing: border-box;
    min-width: 200px;
    max-width: 838px;
    ${normalizedFooterHtml ? 'min-height: 100vh;' : ''}
    margin: 0 auto;
    padding: 45px;
    ${normalizedFooterHtml ? 'display: flex;' : ''}
    ${normalizedFooterHtml ? 'flex-direction: column;' : ''}
  }
  .markdown-body .markdown-alert {
    padding: 0.5rem 1rem;
  }
  @media (prefers-color-scheme: dark) {
    body {
      background-color: ${darkBackgroundColor};
    }
  }
  @media (max-width: 767px) {
    body {
      max-width: 100%;
      padding: 25px;
    }
  }${extraCssBlock}
${footerStyle}
</style>
${renderSlot(slots, 'headEnd', context)}
</head>
<body${bodyClassAttribute(bodyClass)}>
${renderSlot(slots, 'bodyStart', context)}
${renderSlot(slots, 'articleBefore', context)}
<article class="markdown-body">
${htmlBody}
</article>
${renderSlot(slots, 'articleAfter', context)}
${bodyScripts.join('\n')}
${footerMarkup}
${renderSlot(slots, 'bodyEnd', context)}
</body>
</html>`;
  } catch (error) {
    throw new Error(`Markdown conversion failed: ${error.message}`);
  }
}
