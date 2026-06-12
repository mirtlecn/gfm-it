package gfmit

import (
	"fmt"
	"html"
	"net/url"
	"strings"
)

const (
	defaultCSSAssetKey  = "ravel_gfm_css"
	defaultAssetMode    = "remote"
	defaultAssetBaseURL = "/asset/"
	darkBackgroundColor = "#0d1117"
	gfmCSSAssetSuffix   = "_gfm_css"
	assetModeLocal      = "local"
	assetModeInline     = "inline"
	assetModeRemote     = "remote"
)

// RenderOptions customizes Markdown rendering and the generated HTML wrapper.
type RenderOptions struct {
	Title           string
	Canonical       string
	FallbackImage   bool
	CSS             string
	AssetMode       string
	AssetBaseURL    string
	ResolveAssetURL func(Asset) (string, error)
	Slots           RenderSlots
	ExtraCSS        string
	BodyClass       string
	FooterHTML      string
}

// RenderSlots injects application-owned raw HTML into fixed wrapper positions.
type RenderSlots struct {
	HeadEnd       string
	BodyStart     string
	ArticleBefore string
	ArticleAfter  string
	BodyEnd       string
}

type normalizedRenderOptions struct {
	RenderOptions
	CSS          string
	CSSHref      string
	AssetMode    string
	AssetBaseURL string
}

// RenderMarkdownToHTML converts GitHub Flavored Markdown into a complete HTML document.
func RenderMarkdownToHTML(markdown string, options RenderOptions) (string, error) {
	metadata, err := extractMarkdownMetadata(markdown, options)
	if err != nil {
		return "", fmt.Errorf("markdown conversion failed: %w", err)
	}
	normalized, err := normalizeRenderOptions(options, metadata.CSS)
	if err != nil {
		return "", err
	}
	htmlBody, err := renderMarkdownBody(metadata.Content)
	if err != nil {
		return "", fmt.Errorf("markdown conversion failed: %w", err)
	}
	headLinks, bodyScripts, err := dynamicAssets(htmlBody, normalized)
	if err != nil {
		return "", fmt.Errorf("markdown conversion failed: %w", err)
	}

	footerHTML := normalizeFooterHTML(normalized.FooterHTML)
	return renderHTMLDocument(metadata, htmlBody, headLinks, bodyScripts, footerHTML, normalized), nil
}

func normalizeRenderOptions(options RenderOptions, frontMatterCSS string) (normalizedRenderOptions, error) {
	assetMode := strings.TrimSpace(options.AssetMode)
	if assetMode == "" {
		assetMode = defaultAssetMode
	}
	css, cssHref, ok := normalizeFrontMatterCSSReference(frontMatterCSS)
	if !ok {
		var err error
		css, cssHref, err = normalizeCSSReference(options.CSS, assetMode)
		if err != nil {
			return normalizedRenderOptions{}, err
		}
	}
	assetBaseURL := options.AssetBaseURL
	if assetBaseURL == "" {
		assetBaseURL = defaultAssetBaseURL
	}
	return normalizedRenderOptions{
		RenderOptions: options,
		CSS:           css,
		CSSHref:       cssHref,
		AssetMode:     assetMode,
		AssetBaseURL:  assetBaseURL,
	}, nil
}

func supportedCSSAssetKeys() []string {
	keys := []string{}
	for _, asset := range assets {
		if strings.HasSuffix(asset.Key, gfmCSSAssetSuffix) && strings.HasPrefix(asset.ContentType, "text/css") {
			keys = append(keys, asset.Key)
		}
	}
	return keys
}

func supportedCSSAssetAliases() []string {
	keys := supportedCSSAssetKeys()
	aliases := make([]string, 0, len(keys))
	for _, key := range keys {
		aliases = append(aliases, strings.TrimSuffix(key, gfmCSSAssetSuffix))
	}
	return aliases
}

func formatSupportedCSSAssets() string {
	return strings.Join(supportedCSSAssetAliases(), ", ") + " (or " + strings.Join(supportedCSSAssetKeys(), ", ") + ")"
}

func normalizeCSSAssetKey(css string) (string, error) {
	requested := strings.TrimSpace(css)
	if requested == "" {
		requested = defaultCSSAssetKey
	}
	candidate := requested
	if !strings.HasSuffix(candidate, gfmCSSAssetSuffix) {
		candidate += gfmCSSAssetSuffix
	}
	for _, key := range supportedCSSAssetKeys() {
		if candidate == key {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("unsupported CSS asset: %s (supported: %s)", requested, formatSupportedCSSAssets())
}

func hasCSSPath(value string) bool {
	path := strings.SplitN(value, "?", 2)[0]
	path = strings.SplitN(path, "#", 2)[0]
	return strings.HasSuffix(strings.ToLower(path), ".css")
}

func isRemoteCSSHref(value string) bool {
	parsed, err := url.Parse(value)
	if err != nil {
		return false
	}
	return (parsed.Scheme == "http" || parsed.Scheme == "https") && parsed.Host != "" && hasCSSPath(parsed.Path)
}

func isURLLike(value string) bool {
	parsed, err := url.Parse(value)
	return err == nil && parsed.Scheme != ""
}

func isLocalCSSHref(value string) bool {
	return hasCSSPath(value) || strings.HasPrefix(value, "/") || strings.HasPrefix(value, "./") || strings.HasPrefix(value, "../")
}

func normalizeCSSReference(css string, assetMode string) (string, string, error) {
	requested := strings.TrimSpace(css)
	if requested == "" {
		requested = defaultCSSAssetKey
	}
	if isRemoteCSSHref(requested) || (!isURLLike(requested) && isLocalCSSHref(requested)) {
		if assetMode != assetModeRemote {
			return "", "", fmt.Errorf("CSS hrefs require asset mode remote: %s", requested)
		}
		return "", requested, nil
	}
	if isURLLike(requested) {
		return "", "", fmt.Errorf("unsupported CSS URL: %s (CSS URLs must use http or https and end with .css)", requested)
	}
	cssKey, err := normalizeCSSAssetKey(requested)
	if err != nil {
		return "", "", err
	}
	return cssKey, "", nil
}

func normalizeFrontMatterCSSReference(css string) (string, string, bool) {
	if strings.TrimSpace(css) == "" {
		return "", "", false
	}
	cssKey, cssHref, err := normalizeCSSReference(css, assetModeRemote)
	if err != nil {
		return "", "", false
	}
	return cssKey, cssHref, true
}

func dynamicAssets(htmlBody string, options normalizedRenderOptions) ([]string, []string, error) {
	baseCSS, err := renderMainStylesheet(options)
	if err != nil {
		return nil, nil, err
	}
	headLinks := []string{baseCSS}
	bodyScripts := []string{}

	if countHeadings(htmlBody) >= 2 {
		cssAsset, err := renderStylesheetAsset("gfm_addons_css", options, "")
		if err != nil {
			return nil, nil, err
		}
		jsAsset, err := renderScriptAsset("gfm_addons_js", options, false)
		if err != nil {
			return nil, nil, err
		}
		headLinks = append(headLinks, cssAsset)
		bodyScripts = append(bodyScripts, jsAsset)
	}

	if hasHighlightedCode(htmlBody) {
		lightAsset, err := renderStylesheetAsset("highlight_light_css", options, "(prefers-color-scheme: light)")
		if err != nil {
			return nil, nil, err
		}
		darkAsset, err := renderStylesheetAsset("highlight_dark_css", options, "(prefers-color-scheme: dark)")
		if err != nil {
			return nil, nil, err
		}
		highlightJSAsset, err := renderScriptAsset("highlight_js", options, true)
		if err != nil {
			return nil, nil, err
		}
		headLinks = append(headLinks,
			lightAsset,
			darkAsset,
		)
		bodyScripts = append(bodyScripts,
			highlightJSAsset,
			"<script>window.addEventListener('DOMContentLoaded', function(){ if (window.hljs && hljs.highlightAll) hljs.highlightAll(); });</script>",
		)
	}

	if hasDisplayMath(htmlBody) {
		headLinks = append(headLinks, stylesheetLink(katexStylesheetURL, ""))
	}

	return headLinks, bodyScripts, nil
}

func renderMainStylesheet(options normalizedRenderOptions) (string, error) {
	if options.CSSHref != "" {
		return stylesheetLink(options.CSSHref, ""), nil
	}
	return renderStylesheetAsset(options.CSS, options, "")
}

func renderStylesheetAsset(key string, options normalizedRenderOptions, media string) (string, error) {
	asset, ok := GetAsset(key)
	if !ok {
		return "", fmt.Errorf("unknown GFM asset: %s", key)
	}
	if options.AssetMode == assetModeInline && options.ResolveAssetURL == nil {
		content, err := readEmbeddedAssetContent(key)
		if err != nil {
			return "", err
		}
		return inlineStyleTag(asset, string(content), media), nil
	}
	url, err := gfmAssetURL(key, options)
	if err != nil {
		return "", err
	}
	return stylesheetLink(url, media), nil
}

func renderScriptAsset(key string, options normalizedRenderOptions, deferScript bool) (string, error) {
	asset, ok := GetAsset(key)
	if !ok {
		return "", fmt.Errorf("unknown GFM asset: %s", key)
	}
	if options.AssetMode == assetModeInline && options.ResolveAssetURL == nil {
		content, err := readEmbeddedAssetContent(key)
		if err != nil {
			return "", err
		}
		return inlineScriptTag(asset, string(content)), nil
	}
	url, err := gfmAssetURL(key, options)
	if err != nil {
		return "", err
	}
	if deferScript {
		return deferredScriptTag(url), nil
	}
	return scriptTag(url), nil
}

func gfmAssetURL(key string, options normalizedRenderOptions) (string, error) {
	asset, ok := GetAsset(key)
	if !ok {
		return "", fmt.Errorf("unknown GFM asset: %s", key)
	}
	if options.ResolveAssetURL != nil {
		resolved, err := options.ResolveAssetURL(asset)
		if err != nil {
			return "", err
		}
		if resolved == "" {
			return "", fmt.Errorf("ResolveAssetURL must return a non-empty string for asset: %s", key)
		}
		return resolved, nil
	}
	switch options.AssetMode {
	case assetModeLocal:
		return joinAssetBaseURL(options.AssetBaseURL, asset.Key), nil
	case assetModeInline:
		return "", fmt.Errorf("asset mode inline does not produce URLs for GFM asset: %s", key)
	case assetModeRemote:
		if asset.RemoteURL == "" {
			return "", fmt.Errorf("remote URL is not configured for GFM asset: %s", key)
		}
		return asset.RemoteURL, nil
	default:
		return "", fmt.Errorf("unsupported asset mode: %s", options.AssetMode)
	}
}

func joinAssetBaseURL(assetBaseURL, key string) string {
	if assetBaseURL == "" {
		return key
	}
	if strings.HasSuffix(assetBaseURL, "/") {
		return assetBaseURL + key
	}
	return assetBaseURL + "/" + key
}

func renderHTMLDocument(metadata markdownMetadata, htmlBody string, headLinks, bodyScripts []string, footerHTML string, options normalizedRenderOptions) string {
	footerStyle := ""
	footerMarkup := ""
	if footerHTML != "" {
		footerStyle = `
  .post-footer {
    flex-shrink: 0;
    margin-top: auto;
    padding-top: 48px;
    text-align: center;
    font-size: 12px;
  }`
		footerMarkup = "<footer class=\"markdown-body post-footer\">\n" + footerHTML + "\n</footer>"
	}
	extraCSS := ""
	if options.ExtraCSS != "" {
		extraCSS = "\n" + options.ExtraCSS + "\n"
	}

	return "<!doctype html>\n" +
		"<html>\n" +
		"<head>\n" +
		"<meta charset=\"utf-8\">\n" +
		"<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, minimal-ui\">\n" +
		"<title>" + escapeHTML(metadata.Title) + "</title>\n" +
		renderMetadataTags(metadata) + "\n" +
		strings.Join(headLinks, "\n") + "\n" +
		"<style>\n" +
		"  body {\n" +
		"    box-sizing: border-box;\n" +
		"    min-width: 200px;\n" +
		"    max-width: 838px;\n" +
		bodyFooterLayoutCSS(footerHTML) +
		"    margin: 0 auto;\n" +
		"    padding: 45px;\n" +
		bodyFooterFlexCSS(footerHTML) +
		"  }\n" +
		"  .markdown-body .markdown-alert {\n" +
		"    padding: 0.5rem 1rem;\n" +
		"  }\n" +
		calloutCSS() + "\n" +
		"  @media (prefers-color-scheme: dark) {\n" +
		"    body {\n" +
		"      background-color: " + darkBackgroundColor + ";\n" +
		"    }\n" +
		"  }\n" +
		"  @media (max-width: 767px) {\n" +
		"    body {\n" +
		"      max-width: 100%;\n" +
		"      padding: 25px;\n" +
		"    }\n" +
		"  }" + extraCSS + "\n" +
		footerStyle + "\n" +
		"</style>\n" +
		options.Slots.HeadEnd + "\n" +
		"</head>\n" +
		"<body" + bodyClassAttribute(options.BodyClass) + ">\n" +
		options.Slots.BodyStart + "\n" +
		options.Slots.ArticleBefore + "\n" +
		"<article class=\"markdown-body\">\n" +
		htmlBody +
		"\n</article>\n" +
		options.Slots.ArticleAfter + "\n" +
		strings.Join(bodyScripts, "\n") + "\n" +
		footerMarkup + "\n" +
		options.Slots.BodyEnd + "\n" +
		"</body>\n" +
		"</html>"
}

func bodyFooterLayoutCSS(footerHTML string) string {
	if footerHTML == "" {
		return ""
	}
	return "    min-height: 100vh;\n"
}

func bodyFooterFlexCSS(footerHTML string) string {
	if footerHTML == "" {
		return ""
	}
	return "    display: flex;\n    flex-direction: column;\n"
}

func renderMetadataTags(metadata markdownMetadata) string {
	tags := []string{}
	if metadata.Canonical != "" {
		tags = append(tags, canonicalLink(metadata.Canonical))
	}
	if metadata.Description != "" {
		tags = append(tags, metaName("description", metadata.Description))
	}
	tags = append(tags, metaProperty("og:type", "article"))
	if metadata.Title != "" {
		tags = append(tags, metaProperty("og:title", metadata.Title))
	}
	if metadata.Description != "" {
		tags = append(tags, metaProperty("og:description", metadata.Description))
	}
	if metadata.Canonical != "" {
		tags = append(tags, metaProperty("og:url", metadata.Canonical))
	}
	if metadata.Image != "" {
		tags = append(tags, metaProperty("og:image", metadata.Image))
	}
	if metadata.PublishedTime != "" {
		tags = append(tags, metaProperty("article:published_time", metadata.PublishedTime))
	}
	if metadata.ModifiedTime != "" {
		tags = append(tags, metaProperty("article:modified_time", metadata.ModifiedTime))
	}

	card := "summary"
	if metadata.Image != "" {
		card = "summary_large_image"
	}
	tags = append(tags, metaName("twitter:card", card))
	if metadata.Title != "" {
		tags = append(tags, metaName("twitter:title", metadata.Title))
	}
	if metadata.Description != "" {
		tags = append(tags, metaName("twitter:description", metadata.Description))
	}
	if metadata.Image != "" {
		tags = append(tags, metaName("twitter:image", metadata.Image))
	}
	return strings.Join(tags, "\n")
}

func stylesheetLink(href, media string) string {
	mediaAttribute := ""
	if media != "" {
		mediaAttribute = ` media="` + escapeHTML(media) + `"`
	}
	return `<link rel="stylesheet" href="` + escapeHTML(href) + `"` + mediaAttribute + `>`
}

func inlineStyleTag(asset Asset, content, media string) string {
	mediaAttribute := ""
	if media != "" {
		mediaAttribute = ` media="` + escapeHTML(media) + `"`
	}
	return `<style data-gfm-asset="` + escapeHTML(asset.Key) + `"` + mediaAttribute + `>` + "\n" + escapeRawTextEndTag(content, "style") + "\n</style>"
}

func canonicalLink(href string) string {
	return `<link rel="canonical" href="` + escapeHTML(href) + `">`
}

func metaName(name, content string) string {
	return `<meta name="` + escapeHTML(name) + `" content="` + escapeHTML(content) + `">`
}

func metaProperty(property, content string) string {
	return `<meta property="` + escapeHTML(property) + `" content="` + escapeHTML(content) + `">`
}

func scriptTag(src string) string {
	return `<script src="` + escapeHTML(src) + `"></script>`
}

func deferredScriptTag(src string) string {
	return `<script src="` + escapeHTML(src) + `" defer></script>`
}

func inlineScriptTag(asset Asset, content string) string {
	return `<script data-gfm-asset="` + escapeHTML(asset.Key) + `">` + "\n" + escapeRawTextEndTag(content, "script") + "\n</script>"
}

func escapeRawTextEndTag(content, tag string) string {
	content = strings.ReplaceAll(content, "</"+tag, "<\\/"+tag)
	content = strings.ReplaceAll(content, "</"+strings.ToUpper(tag), "<\\/"+strings.ToUpper(tag))
	return content
}

func bodyClassAttribute(bodyClass string) string {
	if bodyClass == "" {
		return ""
	}
	return ` class="` + escapeHTML(bodyClass) + `"`
}

func normalizeFooterHTML(footerHTML string) string {
	return strings.TrimSpace(footerHTML)
}

func escapeHTML(value string) string {
	return html.EscapeString(value)
}
