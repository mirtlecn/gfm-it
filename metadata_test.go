package gfmit

import "testing"

func TestParseMarkdownDocumentStripsYAMLFrontMatter(t *testing.T) {
	content, frontMatter, err := parseMarkdownDocument("---\ntitle: YAML Title\ndescription: YAML Description\n---\n# Visible")
	if err != nil {
		t.Fatalf("parseMarkdownDocument() error = %v", err)
	}
	if content != "# Visible" {
		t.Fatalf("content = %q, want stripped body", content)
	}
	if frontMatter["title"] != "YAML Title" {
		t.Fatalf("title = %#v", frontMatter["title"])
	}
	if frontMatter["description"] != "YAML Description" {
		t.Fatalf("description = %#v", frontMatter["description"])
	}
}

func TestParseMarkdownDocumentKeepsUnclosedFrontMatter(t *testing.T) {
	input := "---\nnot: closed\nbody"
	content, frontMatter, err := parseMarkdownDocument(input)
	if err != nil {
		t.Fatalf("parseMarkdownDocument() error = %v", err)
	}
	if content != input {
		t.Fatalf("content = %q, want original input", content)
	}
	if len(frontMatter) != 0 {
		t.Fatalf("frontMatter = %#v, want empty", frontMatter)
	}
}

func TestExtractMarkdownMetadataUsesPriorityRules(t *testing.T) {
	metadata, err := extractMarkdownMetadata(`---
title: YAML Title
description: YAML Description
canonical: https://yaml.example/post
cover: https://yaml.example/cover.png
date: 2026-06-10
update: 2026-06-11T10:20:30Z
---
# Heading Title

Body text.`, RenderOptions{
		Title:     "Option Title",
		Canonical: "https://option.example/post",
	})
	if err != nil {
		t.Fatalf("extractMarkdownMetadata() error = %v", err)
	}
	if metadata.Title != "Option Title" {
		t.Fatalf("Title = %q", metadata.Title)
	}
	if metadata.Canonical != "https://option.example/post" {
		t.Fatalf("Canonical = %q", metadata.Canonical)
	}
	if metadata.Description != "YAML Description" {
		t.Fatalf("Description = %q", metadata.Description)
	}
	if metadata.Image != "https://yaml.example/cover.png" {
		t.Fatalf("Image = %q", metadata.Image)
	}
	if metadata.PublishedTime != "2026-06-10" {
		t.Fatalf("PublishedTime = %q", metadata.PublishedTime)
	}
	if metadata.ModifiedTime != "2026-06-11T10:20:30Z" {
		t.Fatalf("ModifiedTime = %q", metadata.ModifiedTime)
	}
}

func TestExtractMarkdownMetadataFallsBackToHeadingBodyImageAndGeneratedImage(t *testing.T) {
	metadata, err := extractMarkdownMetadata("# Heading Title\n\nBody text with [link](https://example.test).\n\n![Body](https://example.test/body.png)", RenderOptions{})
	if err != nil {
		t.Fatalf("extractMarkdownMetadata() error = %v", err)
	}
	if metadata.Title != "Heading Title" {
		t.Fatalf("Title = %q", metadata.Title)
	}
	if metadata.Description != "Body text with link . Body" {
		t.Fatalf("Description = %q", metadata.Description)
	}
	if metadata.Image != "https://example.test/body.png" {
		t.Fatalf("Image = %q", metadata.Image)
	}

	fallback, err := extractMarkdownMetadata("# Heading Title\n\nBody text.", RenderOptions{FallbackImage: true})
	if err != nil {
		t.Fatalf("extractMarkdownMetadata() error = %v", err)
	}
	if fallback.Image == "" || !isHTTPURL(fallback.Image) {
		t.Fatalf("fallback Image = %q", fallback.Image)
	}
	repeated, err := extractMarkdownMetadata("# Heading Title\n\nBody text.", RenderOptions{FallbackImage: true})
	if err != nil {
		t.Fatalf("extractMarkdownMetadata() error = %v", err)
	}
	if fallback.Image != repeated.Image {
		t.Fatalf("fallback image is not stable: %q != %q", fallback.Image, repeated.Image)
	}
}

func TestExtractMarkdownMetadataIgnoresRelativeImages(t *testing.T) {
	metadata, err := extractMarkdownMetadata("# Heading\n\n![Body](/relative.png)", RenderOptions{})
	if err != nil {
		t.Fatalf("extractMarkdownMetadata() error = %v", err)
	}
	if metadata.Image != "" {
		t.Fatalf("Image = %q, want empty", metadata.Image)
	}
}
