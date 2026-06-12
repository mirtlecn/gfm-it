import { Marked } from 'marked';
import markedAlert from 'marked-alert';
import markedFootnote from 'marked-footnote';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import { assets, getAsset } from './assets.js';
import { getEmbeddedAssetContent } from './embedded.js';
import { createHash } from 'node:crypto';
import { VFile } from 'vfile';
import { matter } from 'vfile-matter';

export {
  assets,
  getAsset,
  getAssetPath,
  getAssetContentType,
  getAssetRemoteUrl,
} from './assets.js';

const defaultCssAssetKey = 'ravel_gfm_css';
const defaultAssetMode = 'remote';
const defaultAssetBaseUrl = '/asset/';
const darkBackgroundColor = '#0d1117';
const gfmCssAssetSuffix = '_gfm_css';

export const gfmCssAssetKeys = Object.freeze(
  assets
    .filter((asset) => asset.key.endsWith(gfmCssAssetSuffix) && asset.contentType.startsWith('text/css'))
    .map((asset) => asset.key),
);
export const gfmCssAssetAliases = Object.freeze(
  gfmCssAssetKeys.map((key) => key.slice(0, -gfmCssAssetSuffix.length)),
);

const gfmCssAssetKeySet = new Set(gfmCssAssetKeys);
const gfmCssAssetAliasMap = new Map(
  gfmCssAssetKeys.map((key) => [key.slice(0, -gfmCssAssetSuffix.length), key]),
);

export function formatSupportedCssAssets() {
  return `${gfmCssAssetAliases.join(', ')} (or ${gfmCssAssetKeys.join(', ')}); remote mode also accepts stylesheet hrefs`;
}

export function normalizeCssAssetKey(css = defaultCssAssetKey) {
  const requested = css === undefined || css === null ? '' : String(css).trim();
  const candidate = requested || defaultCssAssetKey;
  const normalized = gfmCssAssetAliasMap.get(candidate) || candidate;

  if (!gfmCssAssetKeySet.has(normalized)) {
    throw new Error(`Unsupported CSS asset: ${candidate}. Supported CSS assets: ${formatSupportedCssAssets()}`);
  }

  return normalized;
}

function hasCssPath(value) {
  return value.split(/[?#]/, 1)[0].toLowerCase().endsWith('.css');
}

function isRemoteCssHref(value) {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && Boolean(url.hostname)
      && hasCssPath(url.pathname);
  } catch {
    return false;
  }
}

function isUrlLike(value) {
  try {
    const url = new URL(value);
    return Boolean(url.protocol);
  } catch {
    return false;
  }
}

function isLocalCssHref(value) {
  return hasCssPath(value) || value.startsWith('/') || value.startsWith('./') || value.startsWith('../');
}

export function normalizeCssReference(css = defaultCssAssetKey, options = {}) {
  const requested = css === undefined || css === null ? '' : String(css).trim();
  const candidate = requested || defaultCssAssetKey;
  const assetMode = options.assetMode || defaultAssetMode;

  if (isRemoteCssHref(candidate) || (!isUrlLike(candidate) && isLocalCssHref(candidate))) {
    if (assetMode !== 'remote') {
      throw new Error(`CSS hrefs require assetMode remote: ${candidate}`);
    }
    return { type: 'href', href: candidate };
  }

  if (isUrlLike(candidate)) {
    throw new Error(`Unsupported CSS URL: ${candidate}. CSS URLs must use http or https and end with .css`);
  }

  return { type: 'asset', key: normalizeCssAssetKey(candidate) };
}

function normalizeFrontMatterCssReference(css) {
  const requested = normalizeMetadataValue(css);
  if (!requested) {
    return null;
  }
  try {
    return normalizeCssReference(requested, { assetMode: 'remote' });
  } catch {
    return null;
  }
}

function resolveCssReference(optionCss, frontMatterCss, assetOptions) {
  return normalizeFrontMatterCssReference(frontMatterCss) || normalizeCssReference(optionCss, assetOptions);
}

const metadataLexer = new Marked({ gfm: true, breaks: false });

function createMarkdownRenderer() {
  return new Marked(
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
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function parseMarkdownDocument(markdown) {
  const file = new VFile({ value: String(markdown) });
  matter(file, { strip: true });

  return {
    content: String(file),
    frontMatter: file.data.matter && typeof file.data.matter === 'object' ? file.data.matter : {},
  };
}

function normalizeMetadataValue(value) {
  if (value === undefined || value === null) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function normalizeWhitespace(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function truncateText(value, maxLength) {
  const normalized = normalizeWhitespace(value);
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value);
}

function extractInlineText(tokens = []) {
  return tokens.map((token) => {
    if (token.tokens) {
      return extractInlineText(token.tokens);
    }
    if (typeof token.text === 'string') {
      return token.text;
    }
    if (typeof token.raw === 'string' && token.type === 'text') {
      return token.raw;
    }
    return '';
  }).join(' ');
}

function extractTextFromBlockToken(token, { includeHeadings = false } = {}) {
  if (!token) {
    return '';
  }

  if (token.type === 'heading' && !includeHeadings) {
    return '';
  }
  if (token.type === 'code' || token.type === 'html' || token.type === 'hr' || token.type === 'space') {
    return '';
  }
  if (token.tokens) {
    return extractTextFromTokens(token.tokens, { includeHeadings });
  }
  if (Array.isArray(token.items)) {
    return token.items.map((item) => extractTextFromBlockToken(item, { includeHeadings })).join(' ');
  }
  if (typeof token.text === 'string') {
    return token.text;
  }
  return '';
}

function extractTextFromTokens(tokens = [], options = {}) {
  return tokens.map((token) => extractTextFromBlockToken(token, options)).join(' ');
}

function extractFirstHeading(tokens = []) {
  for (const token of tokens) {
    if (token.type === 'heading') {
      return normalizeWhitespace(token.tokens ? extractInlineText(token.tokens) : token.text);
    }
  }
  return '';
}

function extractFirstHttpImageFromInlineTokens(tokens = []) {
  for (const token of tokens) {
    if (token.type === 'image') {
      const href = normalizeMetadataValue(token.href);
      if (isHttpUrl(href)) {
        return href;
      }
    }
    if (token.tokens) {
      const nested = extractFirstHttpImageFromInlineTokens(token.tokens);
      if (nested) {
        return nested;
      }
    }
  }
  return '';
}

function extractFirstHttpImage(tokens = []) {
  for (const token of tokens) {
    const inlineImage = extractFirstHttpImageFromInlineTokens(token.tokens);
    if (inlineImage) {
      return inlineImage;
    }
    if (Array.isArray(token.items)) {
      const nested = extractFirstHttpImage(token.items);
      if (nested) {
        return nested;
      }
    }
  }
  return '';
}

function resolveImage(frontMatter, tokens) {
  const candidates = [
    normalizeMetadataValue(frontMatter.cover),
    normalizeMetadataValue(frontMatter.image),
    extractFirstHttpImage(tokens),
  ];
  return candidates.find((value) => value && isHttpUrl(value)) || '';
}

function createStableImageSeed(value) {
  return createHash('sha256').update(value || 'gfm-it').digest('hex').slice(0, 16);
}

function resolveFallbackImage({ fallbackImage, canonical, title, description, content }) {
  if (!fallbackImage) {
    return '';
  }

  const seed = createStableImageSeed(canonical || title || description || content);
  return `https://picsum.photos/seed/${seed}/1200/630.jpg?grayscale`;
}

function extractMarkdownMetadata(markdown, options = {}) {
  return extractMarkdownMetadataFromDocument(parseMarkdownDocument(markdown), options);
}

function extractMarkdownMetadataFromDocument(document, options = {}) {
  const { content, frontMatter } = document;
  const tokens = metadataLexer.lexer(content);
  const title = normalizeMetadataValue(options.title)
    || normalizeMetadataValue(frontMatter.title)
    || extractFirstHeading(tokens);
  const description = normalizeMetadataValue(frontMatter.description)
    || normalizeMetadataValue(frontMatter.summary)
    || truncateText(extractTextFromTokens(tokens), 160);
  const canonical = normalizeMetadataValue(options.canonical) || normalizeMetadataValue(frontMatter.canonical);
  const image = resolveImage(frontMatter, tokens)
    || resolveFallbackImage({
      fallbackImage: options.fallbackImage,
      canonical,
      title,
      description,
      content,
    });

  return {
    content,
    tokens,
    title,
    description: truncateText(description, 160),
    canonical,
    image,
    publishedTime: normalizeMetadataValue(frontMatter.date),
    modifiedTime: normalizeMetadataValue(frontMatter.update),
    css: normalizeMetadataValue(frontMatter.gfm_css),
  };
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

function inlineStyleTag(asset, content, media = '') {
  const mediaAttribute = media ? ` media="${escapeHtml(media)}"` : '';
  const safeContent = String(content).replace(/<\/style/gi, '<\\/style');
  return `<style data-gfm-asset="${escapeHtml(asset.key)}"${mediaAttribute}>
${safeContent}
</style>`;
}

function canonicalLink(href) {
  return `<link rel="canonical" href="${escapeHtml(href)}">`;
}

function metaName(name, content) {
  return `<meta name="${escapeHtml(name)}" content="${escapeHtml(content)}">`;
}

function metaProperty(property, content) {
  return `<meta property="${escapeHtml(property)}" content="${escapeHtml(content)}">`;
}

function renderMetadataTags(metadata) {
  const tags = [];

  if (metadata.canonical) {
    tags.push(canonicalLink(metadata.canonical));
  }
  if (metadata.description) {
    tags.push(metaName('description', metadata.description));
  }

  tags.push(metaProperty('og:type', 'article'));
  if (metadata.title) {
    tags.push(metaProperty('og:title', metadata.title));
  }
  if (metadata.description) {
    tags.push(metaProperty('og:description', metadata.description));
  }
  if (metadata.canonical) {
    tags.push(metaProperty('og:url', metadata.canonical));
  }
  if (metadata.image) {
    tags.push(metaProperty('og:image', metadata.image));
  }
  if (metadata.publishedTime) {
    tags.push(metaProperty('article:published_time', metadata.publishedTime));
  }
  if (metadata.modifiedTime) {
    tags.push(metaProperty('article:modified_time', metadata.modifiedTime));
  }

  tags.push(metaName('twitter:card', metadata.image ? 'summary_large_image' : 'summary'));
  if (metadata.title) {
    tags.push(metaName('twitter:title', metadata.title));
  }
  if (metadata.description) {
    tags.push(metaName('twitter:description', metadata.description));
  }
  if (metadata.image) {
    tags.push(metaName('twitter:image', metadata.image));
  }

  return tags.join('\n');
}

function scriptTag(src) {
  return `<script src="${escapeHtml(src)}"></script>`;
}

function inlineScriptTag(asset, content) {
  const safeContent = String(content).replace(/<\/script/gi, '<\\/script');
  return `<script data-gfm-asset="${escapeHtml(asset.key)}">
${safeContent}
</script>`;
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

function renderStylesheetAsset(key, options, media = '') {
  const asset = getAsset(key);

  if (options.assetMode === 'inline' && typeof options.resolveAssetUrl !== 'function') {
    return inlineStyleTag(asset, getEmbeddedAssetContent(key), media);
  }

  return stylesheetLink(getGfmAssetUrl(key, options), media);
}

function renderMainStylesheet(cssReference, options) {
  if (cssReference.type === 'href') {
    return stylesheetLink(cssReference.href);
  }
  return renderStylesheetAsset(cssReference.key, options);
}

function renderScriptAsset(key, options) {
  const asset = getAsset(key);

  if (options.assetMode === 'inline' && typeof options.resolveAssetUrl !== 'function') {
    return inlineScriptTag(asset, getEmbeddedAssetContent(key));
  }

  return scriptTag(getGfmAssetUrl(key, options));
}

export function renderMarkdownToHtml(markdown, options = {}) {
  try {
    const {
      title = '',
      canonical = '',
      fallbackImage = false,
      css = defaultCssAssetKey,
      slots = {},
      extraCss = '',
      bodyClass = '',
      footerHtml = '',
    } = options;
    const assetOptions = normalizeAssetOptions(options);
    const parsedMarkdown = parseMarkdownDocument(markdown);
    const metadata = extractMarkdownMetadataFromDocument(parsedMarkdown, { title, canonical, fallbackImage });
    const cssReference = resolveCssReference(css, metadata.css, assetOptions);
    const normalizedCss = cssReference.type === 'asset' ? cssReference.key : cssReference.href;
    const htmlBody = createMarkdownRenderer().parse(metadata.content);
    const normalizedFooterHtml = normalizeFooterHtml(footerHtml);
    const headingCount = countHeadings(htmlBody);
    const codeBlocksPresent = hasHighlightedCode(htmlBody);
    const headLinks = [renderMainStylesheet(cssReference, assetOptions)];
    const bodyScripts = [];

    if (headingCount >= 2) {
      headLinks.push(renderStylesheetAsset('gfm_addons_css', assetOptions));
      bodyScripts.push(renderScriptAsset('gfm_addons_js', assetOptions));
    }

    if (codeBlocksPresent) {
      headLinks.push(renderStylesheetAsset('highlight_light_css', assetOptions, '(prefers-color-scheme: light)'));
      headLinks.push(renderStylesheetAsset('highlight_dark_css', assetOptions, '(prefers-color-scheme: dark)'));
    }

    const context = {
      title: metadata.title,
      css: normalizedCss,
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
<title>${escapeHtml(metadata.title)}</title>
${renderMetadataTags(metadata)}
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
