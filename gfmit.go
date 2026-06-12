package gfmit

import (
	"embed"
	"encoding/json"
	"fmt"
)

// FS contains manifest.json and all packaged static assets.
//
//go:embed manifest.json assets/*
var FS embed.FS

// Asset describes one static resource shipped by this package.
type Asset struct {
	Key         string `json:"key"`
	File        string `json:"file"`
	ContentType string `json:"contentType"`
	RemoteURL   string `json:"remoteUrl"`
}

var assets = mustLoadAssets()
var assetsByKey = indexAssets(assets)

func mustLoadAssets() []Asset {
	data, err := FS.ReadFile("manifest.json")
	if err != nil {
		panic(err)
	}

	var parsed []Asset
	if err := json.Unmarshal(data, &parsed); err != nil {
		panic(err)
	}
	return parsed
}

func indexAssets(items []Asset) map[string]Asset {
	indexed := make(map[string]Asset, len(items))
	for _, item := range items {
		indexed[item.Key] = item
	}
	return indexed
}

// Assets returns a copy of the packaged asset manifest.
func Assets() []Asset {
	items := make([]Asset, len(assets))
	copy(items, assets)
	return items
}

// GetAsset returns metadata for a packaged asset key.
func GetAsset(key string) (Asset, bool) {
	asset, ok := assetsByKey[key]
	return asset, ok
}

// MustAsset returns metadata for a packaged asset key or panics.
func MustAsset(key string) Asset {
	asset, ok := GetAsset(key)
	if !ok {
		panic(fmt.Sprintf("unknown GFM asset: %s", key))
	}
	return asset
}

// ReadAsset returns the file content and metadata for a packaged asset key.
func ReadAsset(key string) ([]byte, Asset, error) {
	asset, ok := GetAsset(key)
	if !ok {
		return nil, Asset{}, fmt.Errorf("unknown GFM asset: %s", key)
	}

	content, err := FS.ReadFile(asset.File)
	if err != nil {
		return nil, Asset{}, err
	}
	return content, asset, nil
}
