package gfmaddons

import "testing"

func TestAssets(t *testing.T) {
	items := Assets()
	if got, want := len(items), 8; got != want {
		t.Fatalf("len(Assets()) = %d, want %d", got, want)
	}

	first, ok := GetAsset("ravel_gfm_css")
	if !ok {
		t.Fatal("ravel_gfm_css is missing")
	}
	if first.File != "assets/ravel-gfm.css" {
		t.Fatalf("ravel_gfm_css file = %q", first.File)
	}
	if first.ContentType != "text/css; charset=utf-8" {
		t.Fatalf("ravel_gfm_css content type = %q", first.ContentType)
	}

	if _, ok := GetAsset("missing"); ok {
		t.Fatal("missing asset unexpectedly exists")
	}
}

func TestReadAsset(t *testing.T) {
	content, asset, err := ReadAsset("github_gfm_css")
	if err != nil {
		t.Fatalf("ReadAsset() error = %v", err)
	}
	if asset.File != "assets/github-gfm.css" {
		t.Fatalf("github_gfm_css file = %q", asset.File)
	}
	if len(content) == 0 {
		t.Fatal("github_gfm_css content is empty")
	}
}

func TestAssetsReturnsCopy(t *testing.T) {
	items := Assets()
	items[0].Key = "changed"
	if MustAsset("ravel_gfm_css").Key != "ravel_gfm_css" {
		t.Fatal("Assets returned mutable package state")
	}
}
