package catalog

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDeleteRemovesMatchingCategoryOnly(t *testing.T) {
	root := t.TempDir()
	writeCase(t, root, "alpha/shared.json", "shared")
	writeCase(t, root, "beta/shared.json", "shared")

	cat := New(root)
	if err := cat.Delete("shared", "alpha"); err != nil {
		t.Fatalf("Delete() error = %v", err)
	}

	if _, err := os.Stat(filepath.Join(root, "alpha", "shared.json")); !os.IsNotExist(err) {
		t.Fatalf("alpha/shared.json should be removed, stat error = %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "beta", "shared.json")); err != nil {
		t.Fatalf("beta/shared.json should remain, stat error = %v", err)
	}
}

func TestDeleteCategoryRemovesNestedDirectory(t *testing.T) {
	root := t.TempDir()
	writeCase(t, root, "fake/sample/sample_delay.json", "sample_delay")
	writeCase(t, root, "baccarat/fetchserverlist.json", "fetchserverlist")

	cat := New(root)
	if err := cat.DeleteCategory("fake/sample"); err != nil {
		t.Fatalf("DeleteCategory() error = %v", err)
	}

	if _, err := os.Stat(filepath.Join(root, "fake", "sample")); !os.IsNotExist(err) {
		t.Fatalf("fake/sample should be removed, stat error = %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "baccarat", "fetchserverlist.json")); err != nil {
		t.Fatalf("unrelated category should remain, stat error = %v", err)
	}
}

func TestDeleteCategoryRejectsUnsafePath(t *testing.T) {
	cat := New(t.TempDir())
	for _, category := range []string{"", ".", "..", "../outside", "/tmp"} {
		if err := cat.DeleteCategory(category); err == nil {
			t.Fatalf("DeleteCategory(%q) error = nil, want error", category)
		}
	}
}

func writeCase(t *testing.T, root, relPath, id string) {
	t.Helper()
	path := filepath.Join(root, filepath.FromSlash(relPath))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	data := `{"id":"` + id + `","name":"` + id + `","steps":[{"step_id":"wait","type":"delay","action":{"duration_ms":1}}]}`
	if err := os.WriteFile(path, []byte(data), 0o644); err != nil {
		t.Fatal(err)
	}
}
