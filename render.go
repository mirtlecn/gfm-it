package gfmit

import (
	"fmt"
	"html"
	"strings"
)

const (
	defaultCSSAssetKey  = "ravel_gfm_css"
	defaultAssetMode    = "remote"
	defaultAssetBaseURL = "/asset/"
	darkBackgroundColor = "#0d1117"
	assetModeLocal      = "local"
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
	AssetMode    string
	AssetBaseURL string
}

// RenderMarkdownToHTML converts GitHub Flavored Markdown into a complete HTML document.
func RenderMarkdownToHTML(markdown string, options RenderOptions) (string, error) {
	normalized := normalizeRenderOptions(options)
	metadata, err := extractMarkdownMetadata(markdown, options)
	if err != nil {
		return "", fmt.Errorf("markdown conversion failed: %w", err)
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

func normalizeRenderOptions(options RenderOptions) normalizedRenderOptions {
	css := strings.TrimSpace(options.CSS)
	if css == "" {
		css = defaultCSSAssetKey
	}
	assetMode := strings.TrimSpace(options.AssetMode)
	if assetMode == "" {
		assetMode = defaultAssetMode
	}
	assetBaseURL := options.AssetBaseURL
	if assetBaseURL == "" {
		assetBaseURL = defaultAssetBaseURL
	}
	return normalizedRenderOptions{
		RenderOptions: options,
		CSS:           css,
		AssetMode:     assetMode,
		AssetBaseURL:  assetBaseURL,
	}
}

func dynamicAssets(htmlBody string, options normalizedRenderOptions) ([]string, []string, error) {
	baseCSS, err := gfmAssetURL(options.CSS, options)
	if err != nil {
		return nil, nil, err
	}
	headLinks := []string{stylesheetLink(baseCSS, "")}
	bodyScripts := []string{}

	if countHeadings(htmlBody) >= 2 {
		cssURL, err := gfmAssetURL("gfm_addons_css", options)
		if err != nil {
			return nil, nil, err
		}
		jsURL, err := gfmAssetURL("gfm_addons_js", options)
		if err != nil {
			return nil, nil, err
		}
		headLinks = append(headLinks, stylesheetLink(cssURL, ""))
		bodyScripts = append(bodyScripts, scriptTag(jsURL))
	}

	if hasHighlightedCode(htmlBody) {
		lightURL, err := gfmAssetURL("highlight_light_css", options)
		if err != nil {
			return nil, nil, err
		}
		darkURL, err := gfmAssetURL("highlight_dark_css", options)
		if err != nil {
			return nil, nil, err
		}
		highlightJSURL, err := gfmAssetURL("highlight_js", options)
		if err != nil {
			return nil, nil, err
		}
		headLinks = append(headLinks,
			stylesheetLink(lightURL, "(prefers-color-scheme: light)"),
			stylesheetLink(darkURL, "(prefers-color-scheme: dark)"),
		)
		bodyScripts = append(bodyScripts,
			deferredScriptTag(highlightJSURL),
			"<script>window.addEventListener('DOMContentLoaded', function(){ if (window.hljs && hljs.highlightAll) hljs.highlightAll(); });</script>",
		)
	}

	if hasDisplayMath(htmlBody) {
		headLinks = append(headLinks, stylesheetLink(katexStylesheetURL, ""))
	}

	return headLinks, bodyScripts, nil
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
