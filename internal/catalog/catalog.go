package catalog

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"octoassert/internal/testcase"
)

type Catalog struct {
	root string
}

func New(root string) *Catalog {
	return &Catalog{root: root}
}

func (c *Catalog) List() ([]testcase.TestCase, error) {
	var cases []testcase.TestCase
	err := filepath.WalkDir(c.root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			return nil
		}
		tc, err := c.load(path)
		if err != nil {
			return fmt.Errorf("%s: %w", path, err)
		}
		cases = append(cases, tc)
		return nil
	})
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	sort.Slice(cases, func(i, j int) bool {
		return cases[i].ID < cases[j].ID
	})
	return cases, nil
}

func (c *Catalog) Get(id string) (testcase.TestCase, error) {
	cases, err := c.List()
	if err != nil {
		return testcase.TestCase{}, err
	}
	for _, tc := range cases {
		if tc.ID == id {
			return tc, nil
		}
	}
	return testcase.TestCase{}, fmt.Errorf("test case not found: %s", id)
}

func (c *Catalog) load(path string) (testcase.TestCase, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return testcase.TestCase{}, err
	}
	var tc testcase.TestCase
	if err := json.Unmarshal(data, &tc); err != nil {
		return testcase.TestCase{}, err
	}
	if tc.ID == "" {
		return testcase.TestCase{}, fmt.Errorf("missing id")
	}
	if len(tc.Steps) == 0 {
		return testcase.TestCase{}, fmt.Errorf("missing steps")
	}
	category, err := categoryFor(c.root, path)
	if err != nil {
		return testcase.TestCase{}, err
	}
	tc.Category = category
	tc.SourcePath = path
	return tc, nil
}

// Delete removes the JSON file for the given test case ID.
// If category is set, it is used to disambiguate duplicate IDs.
func (c *Catalog) Delete(id, category string) error {
	cases, err := c.List()
	if err != nil {
		return err
	}
	for _, tc := range cases {
		if tc.ID == id && (category == "" || tc.Category == category) {
			return os.Remove(tc.SourcePath)
		}
	}
	return fmt.Errorf("test case not found: %s", id)
}

// DeleteCategory removes a category directory under the catalog root.
func (c *Catalog) DeleteCategory(category string) error {
	clean, err := cleanCategory(category)
	if err != nil {
		return err
	}
	path := filepath.Join(c.root, filepath.FromSlash(clean))
	if err := ensureInsideRoot(c.root, path); err != nil {
		return err
	}
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("category not found: %s", category)
		}
		return err
	}
	if !info.IsDir() {
		return fmt.Errorf("category is not a directory: %s", category)
	}
	return os.RemoveAll(path)
}

// Save writes tc as a JSON file under <root>/<category>/<id>.json.
// Directories are created as needed.
func (c *Catalog) Save(tc testcase.TestCase, category string) error {
	dir := filepath.Join(c.root, filepath.FromSlash(category))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(tc, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, tc.ID+".json"), data, 0o644)
}

func categoryFor(root, path string) (string, error) {
	rel, err := filepath.Rel(root, filepath.Dir(path))
	if err != nil {
		return "", err
	}
	if rel == "." {
		return "uncategorized", nil
	}
	return filepath.ToSlash(rel), nil
}

func cleanCategory(category string) (string, error) {
	clean := filepath.ToSlash(filepath.Clean(filepath.FromSlash(strings.TrimSpace(category))))
	if clean == "" || clean == "." || clean == "/" || clean == "uncategorized" {
		return "", fmt.Errorf("invalid category: %s", category)
	}
	if strings.HasPrefix(clean, "../") || clean == ".." || filepath.IsAbs(clean) {
		return "", fmt.Errorf("invalid category: %s", category)
	}
	return clean, nil
}

func ensureInsideRoot(root, path string) error {
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return err
	}
	absPath, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	rel, err := filepath.Rel(absRoot, absPath)
	if err != nil {
		return err
	}
	if rel == "." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || rel == ".." {
		return fmt.Errorf("path escapes catalog root")
	}
	return nil
}
