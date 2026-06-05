package api

import (
	"context"
	"embed"
	"encoding/json"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"octoassert/internal/catalog"
	"octoassert/internal/runner"
	"octoassert/internal/store"
	"octoassert/internal/testcase"
)

//go:embed all:web
var webFS embed.FS

type Server struct {
	catalog *catalog.Catalog
	runner  *runner.Runner
	store   store.Store
}

func New(catalog *catalog.Catalog, runner *runner.Runner, store store.Store) *Server {
	return &Server{catalog: catalog, runner: runner, store: store}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	// Serve embedded static files
	subFS, err := fs.Sub(webFS, "web")
	if err != nil {
		panic("failed to load web filesystem: " + err.Error())
	}
	mux.Handle("/", http.FileServer(http.FS(subFS)))

	// API Routes
	mux.HandleFunc("/api/testcases", s.handleTestCases)
	mux.HandleFunc("/api/testcases/bulk-delete", s.handleBulkDeleteTestCases)
	mux.HandleFunc("/api/testcases/bulk-move", s.handleBulkMoveTestCases)
	mux.HandleFunc("/api/testcases/reorder", s.handleReorderTestCases)
	mux.HandleFunc("/api/testcases/", s.handleTestCase)
	mux.HandleFunc("/api/catalog/categories", s.handleCatalogCategoriesRoot)
	mux.HandleFunc("/api/catalog/categories/", s.handleCatalogCategory)
	mux.HandleFunc("/api/runs", s.handleRuns)
	mux.HandleFunc("/api/run", s.handleRun)

	// Explorer utilities (reflection + categories, reused by Builder)
	mux.HandleFunc("/api/explore/categories", s.handleExploreCategories)
	mux.HandleFunc("/api/explore/reflect", s.handleExploreReflect)
	mux.HandleFunc("/api/explore/run", s.handleExploreRun)
	mux.HandleFunc("/api/explore/save", s.handleExploreSave)
	mux.HandleFunc("/api/files/browse", s.handleBrowseFiles)

	// Test Case Builder
	mux.HandleFunc("/api/builder/run-step", s.handleBuilderRunStep)
	mux.HandleFunc("/api/builder/run", s.handleBuilderRun)
	mux.HandleFunc("/api/builder/save", s.handleBuilderSave)
	return mux
}

func (s *Server) handleTestCases(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	cases, err := s.catalog.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	summaries := make([]testcase.Summary, 0, len(cases))
	for _, tc := range cases {
		summaries = append(summaries, tc.Summary())
	}
	writeJSON(w, summaries)
}

func (s *Server) handleBulkDeleteTestCases(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		Items []struct {
			ID       string `json:"id"`
			Category string `json:"category"`
		} `json:"items"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(req.Items) == 0 {
		writeError(w, http.StatusBadRequest, "missing test cases")
		return
	}
	deleted := 0
	for _, item := range req.Items {
		if item.ID == "" {
			continue
		}
		if err := s.catalog.Delete(item.ID, item.Category); err != nil {
			writeError(w, http.StatusNotFound, err.Error())
			return
		}
		deleted++
	}
	writeJSON(w, map[string]int{"deleted": deleted})
}

func (s *Server) handleBulkMoveTestCases(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		Items []struct {
			ID       string `json:"id"`
			Category string `json:"category"`
		} `json:"items"`
		Target string `json:"target"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(req.Items) == 0 {
		writeError(w, http.StatusBadRequest, "missing test cases")
		return
	}
	moved := 0
	for _, item := range req.Items {
		if item.ID == "" {
			continue
		}
		if err := s.catalog.Move(item.ID, item.Category, req.Target); err != nil {
			continue // skip failures, move what we can
		}
		moved++
	}
	writeJSON(w, map[string]int{"moved": moved})
}

func (s *Server) handleReorderTestCases(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		Category string   `json:"category"`
		IDs      []string `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	changed := 0
	for i, id := range req.IDs {
		tc, err := s.catalog.GetInCategory(id, req.Category)
		if err != nil {
			continue // skip missing
		}
		if tc.Order != i {
			tc.Order = i
			_ = s.catalog.Save(tc, tc.Category)
			changed++
		}
	}
	writeJSON(w, map[string]int{"changed": changed})
}

func (s *Server) handleTestCase(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/testcases/")
	if id == "" {
		writeError(w, http.StatusBadRequest, "missing test case id")
		return
	}
	if strings.HasSuffix(id, "/duplicate") {
		id = strings.TrimSuffix(id, "/duplicate")
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		tc, err := s.catalog.Duplicate(id, r.URL.Query().Get("category"))
		if err != nil {
			writeError(w, http.StatusNotFound, err.Error())
			return
		}
		writeJSON(w, tc)
		return
	}
	if strings.HasSuffix(id, "/move") {
		id = strings.TrimSuffix(id, "/move")
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		var req struct {
			Category string `json:"category"`
			Target   string `json:"target"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		if err := s.catalog.Move(id, req.Category, req.Target); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, map[string]bool{"ok": true})
		return
	}
	switch r.Method {
	case http.MethodGet:
		tc, err := s.catalog.GetInCategory(id, r.URL.Query().Get("category"))
		if err != nil {
			writeError(w, http.StatusNotFound, err.Error())
			return
		}
		writeJSON(w, tc)
	case http.MethodDelete:
		if err := s.catalog.Delete(id, r.URL.Query().Get("category")); err != nil {
			writeError(w, http.StatusNotFound, err.Error())
			return
		}
		writeJSON(w, map[string]bool{"ok": true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) handleCatalogCategoriesRoot(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		Category string `json:"category"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Category == "" {
		writeError(w, http.StatusBadRequest, "missing category")
		return
	}
	if err := s.catalog.CreateCategory(req.Category); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, map[string]bool{"ok": true})
}

func (s *Server) handleCatalogCategory(w http.ResponseWriter, r *http.Request) {
	category := strings.TrimPrefix(r.URL.Path, "/api/catalog/categories/")
	var err error
	category, err = url.PathUnescape(category)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid category")
		return
	}
	if category == "" {
		writeError(w, http.StatusBadRequest, "missing category")
		return
	}
	switch r.Method {
	case http.MethodDelete:
		if err := s.catalog.DeleteCategory(category); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, map[string]bool{"ok": true})
	case http.MethodPost:
		if err := s.catalog.CreateCategory(category); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, map[string]bool{"ok": true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) handleRuns(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	writeJSON(w, s.store.List())
}

func (s *Server) handleRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		ID       string `json:"id"`
		Category string `json:"category"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.ID == "" {
		writeError(w, http.StatusBadRequest, "missing test case id")
		return
	}
	tc, err := s.catalog.GetInCategory(req.ID, req.Category)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	timeout := timeoutFor(tc)
	ctx, cancel := context.WithTimeout(r.Context(), timeout)
	defer cancel()

	flusher, isStreaming := w.(http.Flusher)
	if r.Header.Get("Accept") == "application/x-ndjson" && isStreaming {
		w.Header().Set("Content-Type", "application/x-ndjson")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.WriteHeader(http.StatusOK)

		result := s.runner.RunWithCallback(ctx, tc, func(idx int, status string) {
			json.NewEncoder(w).Encode(map[string]any{"type": "progress", "index": idx, "status": status})
			flusher.Flush()
		})
		s.store.Save(result)
		json.NewEncoder(w).Encode(map[string]any{"type": "complete", "result": result})
		flusher.Flush()
	} else {
		result := s.runner.Run(ctx, tc)
		s.store.Save(result)
		writeJSON(w, result)
	}
}

func (s *Server) handleBrowseFiles(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	path := r.URL.Query().Get("path")
	if path == "" {
		var err error
		path, err = os.Getwd()
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	absPath, err := filepath.Abs(path)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	info, err := os.Stat(absPath)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	if !info.IsDir() {
		absPath = filepath.Dir(absPath)
	}
	entries, err := os.ReadDir(absPath)
	if err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	type fileEntry struct {
		Name    string `json:"name"`
		Path    string `json:"path"`
		RelPath string `json:"rel_path"`
		Type    string `json:"type"`
	}
	cwd, _ := os.Getwd()
	list := make([]fileEntry, 0, len(entries))
	for _, entry := range entries {
		entryPath := filepath.Join(absPath, entry.Name())
		relPath := relativePath(cwd, entryPath)
		if entry.IsDir() {
			list = append(list, fileEntry{Name: entry.Name(), Path: entryPath, RelPath: relPath, Type: "dir"})
			continue
		}
		if strings.EqualFold(filepath.Ext(entry.Name()), ".proto") {
			list = append(list, fileEntry{Name: entry.Name(), Path: entryPath, RelPath: relPath, Type: "file"})
		}
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].Type != list[j].Type {
			return list[i].Type == "dir"
		}
		return strings.ToLower(list[i].Name) < strings.ToLower(list[j].Name)
	})
	parent := filepath.Dir(absPath)
	if parent == absPath {
		parent = ""
	}
	writeJSON(w, map[string]any{
		"path":    absPath,
		"relPath": relativePath(cwd, absPath),
		"parent":  parent,
		"entries": list,
	})
}

func relativePath(base, target string) string {
	if base == "" {
		return filepath.ToSlash(target)
	}
	rel, err := filepath.Rel(base, target)
	if err != nil {
		return filepath.ToSlash(target)
	}
	return filepath.ToSlash(rel)
}

func timeoutFor(tc testcase.TestCase) time.Duration {
	if tc.Config.TimeoutMS > 0 {
		return time.Duration(tc.Config.TimeoutMS) * time.Millisecond
	}
	return 30 * time.Second
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
}

func writeError(w http.ResponseWriter, status int, message string) {
	if message == "" {
		message = http.StatusText(status)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	writeJSON(w, map[string]string{"error": message})
}
