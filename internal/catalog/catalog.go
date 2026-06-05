package catalog

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

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
		if cases[i].Order != cases[j].Order {
			return cases[i].Order < cases[j].Order
		}
		return cases[i].ID < cases[j].ID
	})
	return cases, nil
}

func (c *Catalog) Get(id string) (testcase.TestCase, error) {
	return c.GetInCategory(id, "")
}

func (c *Catalog) GetInCategory(id, category string) (testcase.TestCase, error) {
	cases, err := c.List()
	if err != nil {
		return testcase.TestCase{}, err
	}
	for _, tc := range cases {
		if tc.ID == id && (category == "" || tc.Category == category) {
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
	tc, err := c.GetInCategory(id, category)
	if err != nil {
		return err
	}
	return c.moveToTrash(tc.SourcePath)
}

// Duplicate copies a test case within its category and returns the new case.
func (c *Catalog) Duplicate(id, category string) (testcase.TestCase, error) {
	tc, err := c.GetInCategory(id, category)
	if err != nil {
		return testcase.TestCase{}, err
	}
	cases, err := c.List()
	if err != nil {
		return testcase.TestCase{}, err
	}
	ids := make(map[string]struct{}, len(cases))
	for _, item := range cases {
		if item.Category == tc.Category {
			ids[item.ID] = struct{}{}
		}
	}

	base := tc.ID + "-copy"
	newID := base
	for i := 2; ; i++ {
		if _, ok := ids[newID]; !ok {
			break
		}
		newID = fmt.Sprintf("%s-%d", base, i)
	}

	tc.ID = newID
	tc.Name = tc.Name + " Copy"
	tc.SourcePath = ""
	if err := c.Save(tc, tc.Category); err != nil {
		return testcase.TestCase{}, err
	}
	return c.GetInCategory(newID, tc.Category)
}

// DeleteCategory removes a category directory under the catalog root.
func (c *Catalog) DeleteCategory(category string) error {
	clean, err := cleanCategory(category)
	if err != nil {
		return err
	}
	if clean == "" {
		return fmt.Errorf("cannot delete root catalog folder")
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
	return c.moveToTrash(path)
}

func (c *Catalog) moveToTrash(sourcePath string) error {
	now := time.Now()
	dateStr := now.Format("2006-01-02")
	timeStr := now.Format("150405")
	
	projectRoot := filepath.Dir(c.root)
	trashDir := filepath.Join(projectRoot, "trash", dateStr)
	
	if err := os.MkdirAll(trashDir, 0o755); err != nil {
		return err
	}
	
	baseName := filepath.Base(sourcePath)
	ext := filepath.Ext(baseName)
	nameWithoutExt := strings.TrimSuffix(baseName, ext)
	
	var newName string
	if ext != "" {
		newName = fmt.Sprintf("%s_%s%s", nameWithoutExt, timeStr, ext)
	} else {
		newName = fmt.Sprintf("%s_%s", baseName, timeStr)
	}
	
	targetPath := filepath.Join(trashDir, newName)
	return os.Rename(sourcePath, targetPath)
}

// CreateCategory creates a new category directory and adds a .gitkeep file.
func (c *Catalog) CreateCategory(category string) error {
	clean, err := cleanCategory(category)
	if err != nil {
		return err
	}
	if clean == "" {
		return fmt.Errorf("cannot create root category explicitly")
	}
	path := filepath.Join(c.root, filepath.FromSlash(clean))
	if err := ensureInsideRoot(c.root, path); err != nil {
		return err
	}
	if err := os.MkdirAll(path, 0o755); err != nil {
		return err
	}
	// Write .gitkeep so git tracks the empty folder
	return os.WriteFile(filepath.Join(path, ".gitkeep"), []byte(""), 0o644)
}

// ListCategories returns all category directories found inside the catalog root.
func (c *Catalog) ListCategories() ([]string, error) {
	var categories []string
	err := filepath.WalkDir(c.root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.IsDir() {
			return nil
		}
		// skip the root itself
		if path == c.root {
			return nil
		}
		// ensure it's a valid category
		rel, err := filepath.Rel(c.root, path)
		if err != nil {
			return nil
		}
		cat := filepath.ToSlash(rel)
		if cat == "." || cat == "uncategorized" {
			return nil
		}
		categories = append(categories, cat)
		return nil
	})
	if err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	sort.Strings(categories)
	return categories, nil
}

// Move moves a test case from one category to another.
func (c *Catalog) Move(id, oldCategory, newCategory string) error {
	tc, err := c.GetInCategory(id, oldCategory)
	if err != nil {
		return err
	}
	
	cleanNew, err := cleanCategory(newCategory)
	if err != nil {
		return err
	}
	
	newDir := filepath.Join(c.root, filepath.FromSlash(cleanNew))
	if err := ensureInsideRoot(c.root, newDir); err != nil {
		return err
	}
	if err := os.MkdirAll(newDir, 0o755); err != nil {
		return err
	}
	
	newPath := filepath.Join(newDir, tc.ID+".json")
	if err := ensureInsideRoot(c.root, newPath); err != nil {
		return err
	}
	
	if tc.SourcePath == newPath {
		return nil // already there
	}
	
	if err := os.Rename(tc.SourcePath, newPath); err != nil {
		return err
	}
	return nil
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
	if clean == "" || clean == "." || clean == "uncategorized" {
		return "", nil
	}
	if clean == "/" || strings.HasPrefix(clean, "../") || clean == ".." || filepath.IsAbs(clean) {
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
