package gfmit

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/text"
	"go.yaml.in/yaml/v3"
)

type markdownMetadata struct {
	Content       string
	Title         string
	Description   string
	Canonical     string
	Image         string
	PublishedTime string
	ModifiedTime  string
}

func extractMarkdownMetadata(markdown string, options RenderOptions) (markdownMetadata, error) {
	content, frontMatter, err := parseMarkdownDocument(markdown)
	if err != nil {
		return markdownMetadata{}, err
	}

	source := []byte(content)
	document := newMarkdownRenderer().Parser().Parse(text.NewReader(source))
	title := firstNonEmpty(
		normalizeMetadataValue(options.Title),
		normalizeMetadataValue(frontMatter["title"]),
		extractFirstHeading(document, source),
	)
	description := firstNonEmpty(
		normalizeMetadataValue(frontMatter["description"]),
		normalizeMetadataValue(frontMatter["summary"]),
		truncateText(extractPlainText(document, source), 160),
	)
	canonical := firstNonEmpty(
		normalizeMetadataValue(options.Canonical),
		normalizeMetadataValue(frontMatter["canonical"]),
	)
	image := firstNonEmpty(
		firstHTTPURL(frontMatter["cover"]),
		firstHTTPURL(frontMatter["image"]),
		extractFirstHTTPImage(document),
	)
	if image == "" && options.FallbackImage {
		image = fallbackImageURL(firstNonEmpty(canonical, title, description, content))
	}

	return markdownMetadata{
		Content:       content,
		Title:         title,
		Description:   truncateText(description, 160),
		Canonical:     canonical,
		Image:         image,
		PublishedTime: normalizeMetadataValue(frontMatter["date"]),
		ModifiedTime:  normalizeMetadataValue(frontMatter["update"]),
	}, nil
}

func parseMarkdownDocument(markdown string) (string, map[string]any, error) {
	input := string(markdown)
	frontMatter := map[string]any{}
	if len(input) < 4 {
		return input, frontMatter, nil
	}
	firstLineEnd, hasFirstLine := consumeFrontMatterLine(input, 0)
	if !hasFirstLine || input[:firstLineEnd] != "---" {
		return input, frontMatter, nil
	}

	contentStart := skipFrontMatterLineBreak(input, firstLineEnd)
	offset := contentStart
	for offset < len(input) {
		lineEnd, ok := consumeFrontMatterLine(input, offset)
		if !ok {
			return input, frontMatter, nil
		}
		line := input[offset:lineEnd]
		if line == "---" || line == "..." {
			rawMatter := input[contentStart:offset]
			if strings.TrimSpace(rawMatter) != "" {
				parsedMatter, err := parseYAMLFrontMatter(rawMatter)
				if err != nil {
					return "", nil, fmt.Errorf("parse YAML front matter: %w", err)
				}
				frontMatter = parsedMatter
			}
			return input[skipFrontMatterLineBreak(input, lineEnd):], frontMatter, nil
		}
		offset = skipFrontMatterLineBreak(input, lineEnd)
	}

	return input, frontMatter, nil
}

func parseYAMLFrontMatter(rawMatter string) (map[string]any, error) {
	frontMatter := map[string]any{}
	var document yaml.Node
	if err := yaml.Unmarshal([]byte(rawMatter), &document); err != nil {
		return nil, err
	}
	if len(document.Content) == 0 || document.Content[0].Kind != yaml.MappingNode {
		return frontMatter, nil
	}
	mapping := document.Content[0]
	for i := 0; i+1 < len(mapping.Content); i += 2 {
		keyNode := mapping.Content[i]
		valueNode := mapping.Content[i+1]
		if keyNode.Kind != yaml.ScalarNode || keyNode.Value == "" {
			continue
		}
		frontMatter[keyNode.Value] = yamlScalarValue(valueNode)
	}
	return frontMatter, nil
}

func yamlScalarValue(node *yaml.Node) any {
	if node == nil || node.Kind != yaml.ScalarNode {
		return nil
	}
	return node.Value
}

func consumeFrontMatterLine(input string, start int) (int, bool) {
	if start >= len(input) {
		return 0, false
	}
	if index := strings.IndexAny(input[start:], "\r\n"); index >= 0 {
		return start + index, true
	}
	return len(input), true
}

func skipFrontMatterLineBreak(input string, index int) int {
	if index >= len(input) {
		return index
	}
	if input[index] == '\r' {
		index++
	}
	if index < len(input) && input[index] == '\n' {
		index++
	}
	return index
}

func normalizeMetadataValue(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(typed)
	case time.Time:
		return typed.Format(time.RFC3339)
	case fmt.Stringer:
		return strings.TrimSpace(typed.String())
	case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, uintptr, float32, float64, bool:
		return strings.TrimSpace(fmt.Sprint(typed))
	default:
		return ""
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func normalizeWhitespace(value string) string {
	return strings.Join(strings.Fields(value), " ")
}

func truncateText(value string, maxLength int) string {
	normalized := normalizeWhitespace(value)
	if maxLength <= 0 {
		return ""
	}
	if utf8.RuneCountInString(normalized) <= maxLength {
		return normalized
	}
	runes := []rune(normalized)
	return string(runes[:maxLength])
}

func isHTTPURL(value string) bool {
	parsed, err := url.Parse(value)
	return err == nil && (parsed.Scheme == "http" || parsed.Scheme == "https") && parsed.Host != ""
}

func firstHTTPURL(value any) string {
	normalized := normalizeMetadataValue(value)
	if isHTTPURL(normalized) {
		return normalized
	}
	return ""
}

func extractFirstHeading(document ast.Node, source []byte) string {
	var heading string
	_ = ast.Walk(document, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering || heading != "" {
			return ast.WalkContinue, nil
		}
		if node.Kind() == ast.KindHeading {
			heading = normalizeWhitespace(string(node.Text(source)))
			return ast.WalkStop, nil
		}
		return ast.WalkContinue, nil
	})
	return heading
}

func extractFirstHTTPImage(document ast.Node) string {
	var image string
	_ = ast.Walk(document, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering || image != "" {
			return ast.WalkContinue, nil
		}
		if node.Kind() == ast.KindImage {
			if imageNode, ok := node.(*ast.Image); ok {
				candidate := string(imageNode.Destination)
				if isHTTPURL(candidate) {
					image = candidate
					return ast.WalkStop, nil
				}
			}
		}
		return ast.WalkContinue, nil
	})
	return image
}

func extractPlainText(document ast.Node, source []byte) string {
	var parts []string
	_ = ast.Walk(document, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		switch node.Kind() {
		case ast.KindHeading, ast.KindCodeBlock, ast.KindFencedCodeBlock, ast.KindHTMLBlock, ast.KindThematicBreak:
			return ast.WalkSkipChildren, nil
		case ast.KindText, ast.KindString, ast.KindAutoLink, ast.KindCodeSpan:
			text := normalizeWhitespace(string(node.Text(source)))
			if text != "" {
				parts = append(parts, text)
			}
		}
		return ast.WalkContinue, nil
	})
	return strings.Join(parts, " ")
}

func fallbackImageURL(seedSource string) string {
	if seedSource == "" {
		seedSource = "gfm-it"
	}
	sum := sha256.Sum256([]byte(seedSource))
	return "https://picsum.photos/seed/" + hex.EncodeToString(sum[:])[:16] + "/1200/630.jpg?grayscale"
}
