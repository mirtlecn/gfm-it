package gfmit

import (
	"bytes"
	"regexp"
	"strings"

	callouts "github.com/ZMT-Creative/gm-alert-callouts"
	katex "github.com/libkush/goldmark-katex"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	gmhtml "github.com/yuin/goldmark/renderer/html"
)

const katexStylesheetURL = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"

var headingPattern = regexp.MustCompile(`(?i)<h[1-6]\b`)

func newMarkdownRenderer() goldmark.Markdown {
	return goldmark.New(
		goldmark.WithExtensions(
			extension.GFM,
			extension.Footnote,
			callouts.AlertCallouts,
			&katex.Extender{},
		),
		goldmark.WithParserOptions(parser.WithAutoHeadingID()),
		goldmark.WithRendererOptions(gmhtml.WithUnsafe()),
	)
}

func renderMarkdownBody(markdown string) (string, error) {
	var buf bytes.Buffer
	if err := newMarkdownRenderer().Convert([]byte(markdown), &buf); err != nil {
		return "", err
	}
	return buf.String(), nil
}

func countHeadings(htmlBody string) int {
	return len(headingPattern.FindAllString(htmlBody, -1))
}

func hasHighlightedCode(htmlBody string) bool {
	return strings.Contains(htmlBody, `<code class="language-`) || strings.Contains(htmlBody, `<code class="hljs language-`)
}

func hasDisplayMath(htmlBody string) bool {
	return strings.Contains(htmlBody, `<span class="katex-display">`)
}

func calloutCSS() string {
	return strings.Join([]string{
		".markdown-body .callout { border-left: 4px solid #9e9e9e; padding: 0.75rem 1rem; margin: 1rem 0; background: #f6f8fa; border-radius: 6px; }",
		".markdown-body .callout-title { display: flex; align-items: center; gap: 0.5rem; font-weight: 600; }",
		".markdown-body .callout-title-text { margin: 0; }",
		".markdown-body .callout-body > :first-child { margin-top: 0.5rem; }",
		".markdown-body .callout-note { border-color: #2f81f7; }",
		".markdown-body .callout-tip { border-color: #3fb950; }",
		".markdown-body .callout-important { border-color: #a371f7; }",
		".markdown-body .callout-warning { border-color: #d29922; }",
		".markdown-body .callout-caution { border-color: #f85149; }",
		"@media (prefers-color-scheme: dark) {",
		"  .markdown-body .callout { background: #161b22; color: inherit; }",
		"  .markdown-body .callout-note { border-color: #58a6ff; }",
		"  .markdown-body .callout-tip { border-color: #3fb950; }",
		"  .markdown-body .callout-important { border-color: #a371f7; }",
		"  .markdown-body .callout-warning { border-color: #d29922; }",
		"  .markdown-body .callout-caution { border-color: #f85149; }",
		"}",
	}, "\n")
}
