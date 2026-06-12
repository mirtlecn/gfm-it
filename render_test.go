package gfmit

import (
	"regexp"
	"strings"
	"testing"
)

func TestRenderMarkdownToHTMLReturnsCompleteDocumentWithRemoteAssets(t *testing.T) {
	html, err := RenderMarkdownToHTML("# Hello", RenderOptions{Title: "Hello <World>"})
	if err != nil {
		t.Fatalf("RenderMarkdownToHTML() error = %v", err)
	}
	if !strings.HasPrefix(html, "<!doctype html>") {
		t.Fatalf("expected doctype, got %q", html)
	}
	assertContains(t, html, "<html>")
	assertContains(t, html, "<title>Hello &lt;World&gt;</title>")
	assertContains(t, html, `<meta property="og:title" content="Hello &lt;World&gt;">`)
	assertContains(t, html, MustAsset("ravel_gfm_css").RemoteURL)
	assertNotContains(t, html, "gfm-addons.js")
	assertNotContains(t, html, "highlight-light.css")
}

func TestRenderMarkdownToHTMLUsesYAMLMetadataWithoutRenderingFrontMatter(t *testing.T) {
	html, err := RenderMarkdownToHTML(`---
title: YAML Title
description: YAML Description
canonical: https://example.test/post
cover: https://example.test/cover.png
date: 2026-06-10
update: 2026-06-11T10:20:30Z
---
# Visible`, RenderOptions{})
	if err != nil {
		t.Fatalf("RenderMarkdownToHTML() error = %v", err)
	}
	article := html[strings.Index(html, `<article class="markdown-body">`):strings.Index(html, "</article>")]
	assertContains(t, html, "<title>YAML Title</title>")
	assertContains(t, html, `<link rel="canonical" href="https://example.test/post">`)
	assertContains(t, html, `<meta name="description" content="YAML Description">`)
	assertContains(t, html, `<meta property="og:url" content="https://example.test/post">`)
	assertContains(t, html, `<meta property="og:image" content="https://example.test/cover.png">`)
	assertContains(t, html, `<meta property="article:published_time" content="2026-06-10">`)
	assertContains(t, html, `<meta property="article:modified_time" content="2026-06-11T10:20:30Z">`)
	assertContains(t, article, "Visible")
	assertNotContains(t, article, "YAML Title")
	assertNotContains(t, article, "canonical:")
}

func TestRenderMarkdownToHTMLSupportsLocalAssetsAndDynamicResources(t *testing.T) {
	html, err := RenderMarkdownToHTML("# One\n\n## Two\n\n```go\nfmt.Println(\"hi\")\n```\n\n$$\na+b\n$$", RenderOptions{AssetMode: "local"})
	if err != nil {
		t.Fatalf("RenderMarkdownToHTML() error = %v", err)
	}
	assertContains(t, html, `href="/asset/ravel_gfm_css"`)
	assertContains(t, html, `href="/asset/gfm_addons_css"`)
	assertContains(t, html, `src="/asset/gfm_addons_js"`)
	assertContains(t, html, `href="/asset/highlight_light_css" media="(prefers-color-scheme: light)"`)
	assertContains(t, html, `href="/asset/highlight_dark_css" media="(prefers-color-scheme: dark)"`)
	assertContains(t, html, `src="/asset/highlight_js" defer`)
	assertContains(t, html, "katex.min.css")
}

func TestRenderMarkdownToHTMLSupportsSlotsExtraCSSBodyClassAndFooter(t *testing.T) {
	html, err := RenderMarkdownToHTML("# One\n\n## Two", RenderOptions{
		AssetMode:  "local",
		ExtraCSS:   ".custom { color: red; }",
		BodyClass:  "custom-body",
		FooterHTML: " footer-e8c3a91f <a href=\"https://example.test/link-42\">link-17b92</a> ",
		Slots: RenderSlots{
			HeadEnd:       `<meta name="x-test" content="1">`,
			BodyStart:     "<!-- raw hint -->",
			ArticleBefore: "<nav>before</nav>",
			ArticleAfter:  "<footer>after</footer>",
			BodyEnd:       "<script>window.done = true;</script>",
		},
	})
	if err != nil {
		t.Fatalf("RenderMarkdownToHTML() error = %v", err)
	}
	assertContains(t, html, `<meta name="x-test" content="1">`)
	assertContains(t, html, `<body class="custom-body">`)
	assertContains(t, html, "<!-- raw hint -->")
	assertContains(t, html, "<nav>before</nav>")
	assertContains(t, html, "<footer>after</footer>")
	assertContains(t, html, ".custom { color: red; }")
	assertContains(t, html, `<footer class="markdown-body post-footer">
footer-e8c3a91f <a href="https://example.test/link-42">link-17b92</a>
</footer>`)
	assertContains(t, html, "min-height: 100vh;")
	assertContains(t, html, "display: flex;")
	assertContains(t, html, "flex-direction: column;")
	articleEndIndex := strings.Index(html, "</article>")
	tocScriptIndex := strings.Index(html, "/asset/gfm_addons_js")
	footerIndex := strings.Index(html, `<footer class="markdown-body post-footer">`)
	if articleEndIndex == -1 || tocScriptIndex == -1 || footerIndex == -1 || !(articleEndIndex < tocScriptIndex && tocScriptIndex < footerIndex) {
		t.Fatalf("expected footer after article and dynamic scripts, got %q", html)
	}
}

func TestRenderMarkdownToHTMLOmitsBlankFooter(t *testing.T) {
	html, err := RenderMarkdownToHTML("# Hello", RenderOptions{FooterHTML: "   "})
	if err != nil {
		t.Fatalf("RenderMarkdownToHTML() error = %v", err)
	}
	assertNotContains(t, html, "post-footer")
	assertNotContains(t, html, "min-height: 100vh;")
}

func TestRenderMarkdownToHTMLPreservesRawHTMLAndUnclosedFrontMatter(t *testing.T) {
	html, err := RenderMarkdownToHTML("Hello\n\n<script>alert('xss')</script>", RenderOptions{})
	if err != nil {
		t.Fatalf("RenderMarkdownToHTML() error = %v", err)
	}
	assertContains(t, html, "<script>alert('xss')</script>")

	unclosed, err := RenderMarkdownToHTML("---\nnot: closed\nbody", RenderOptions{})
	if err != nil {
		t.Fatalf("RenderMarkdownToHTML() error = %v", err)
	}
	assertContains(t, unclosed, "<hr>")
	assertContains(t, unclosed, "not: closed")
}

func TestRenderMarkdownToHTMLEnablesFallbackSocialImage(t *testing.T) {
	html, err := RenderMarkdownToHTML("# Hello", RenderOptions{FallbackImage: true})
	if err != nil {
		t.Fatalf("RenderMarkdownToHTML() error = %v", err)
	}
	pattern := regexp.MustCompile(`<meta property=\"og:image\" content=\"https://picsum\.photos/seed/[a-f0-9]{16}/1200/630\.jpg\?grayscale\">`)
	if !pattern.MatchString(html) {
		t.Fatalf("expected fallback og:image, got %q", html)
	}
	assertContains(t, html, `<meta name="twitter:card" content="summary_large_image">`)
}

func TestRenderMarkdownToHTMLUsesCustomAssetResolver(t *testing.T) {
	html, err := RenderMarkdownToHTML("# Hello", RenderOptions{
		ResolveAssetURL: func(asset Asset) (string, error) {
			return "/custom/" + asset.Key, nil
		},
	})
	if err != nil {
		t.Fatalf("RenderMarkdownToHTML() error = %v", err)
	}
	assertContains(t, html, `href="/custom/ravel_gfm_css"`)

	_, err = RenderMarkdownToHTML("# Hello", RenderOptions{
		ResolveAssetURL: func(asset Asset) (string, error) { return "", nil },
	})
	if err == nil || !strings.Contains(err.Error(), "ResolveAssetURL must return a non-empty string") {
		t.Fatalf("expected empty resolver error, got %v", err)
	}
}

func TestRenderMarkdownToHTMLRejectsUnsupportedAssetMode(t *testing.T) {
	_, err := RenderMarkdownToHTML("# Hello", RenderOptions{AssetMode: "inline"})
	if err == nil || !strings.Contains(err.Error(), "unsupported asset mode") {
		t.Fatalf("expected unsupported asset mode error, got %v", err)
	}
}

func assertContains(t *testing.T, haystack, needle string) {
	t.Helper()
	if !strings.Contains(haystack, needle) {
		t.Fatalf("expected %q to contain %q", haystack, needle)
	}
}

func assertNotContains(t *testing.T, haystack, needle string) {
	t.Helper()
	if strings.Contains(haystack, needle) {
		t.Fatalf("expected %q not to contain %q", haystack, needle)
	}
}
