package api

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"octoassert/internal/testcase"
)

// handleBuilderRunStep runs a single step definition inline and returns the StepResult.
func (s *Server) handleBuilderRunStep(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var step testcase.Step
	var req struct {
		testcase.Step
		TimeoutMS int `json:"timeout_ms"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	step = req.Step
	if step.StepID == "" {
		step.StepID = "preview"
	}
	tc := testcase.TestCase{
		ID:    "_builder_preview",
		Name:  "Builder Preview",
		Steps: []testcase.Step{step},
	}
	timeout := 30 * time.Second
	if req.TimeoutMS > 0 {
		timeout = time.Duration(req.TimeoutMS) * time.Millisecond
	}
	ctx, cancel := context.WithTimeout(r.Context(), timeout)
	defer cancel()
	result := s.runner.Run(ctx, tc)
	if len(result.Steps) == 0 {
		writeError(w, http.StatusInternalServerError, "no result")
		return
	}
	writeJSON(w, result.Steps[0])
}

// handleBuilderRun runs an entire inline TestCase and returns the RunResult.
func (s *Server) handleBuilderRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var tc testcase.TestCase
	if err := json.NewDecoder(r.Body).Decode(&tc); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if tc.ID == "" {
		tc.ID = "_builder"
	}
	timeout := timeoutFor(tc)
	ctx, cancel := context.WithTimeout(r.Context(), timeout)
	defer cancel()
	result := s.runner.Run(ctx, tc)
	writeJSON(w, result)
}

// handleBuilderSave saves a full multi-step TestCase to the catalog.
func (s *Server) handleBuilderSave(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		testcase.TestCase
		Category string `json:"category"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.ID == "" {
		req.ID = slugify(req.Name)
	}
	if req.ID == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	category := req.Category
	if category == "" {
		category = "builder"
	}
	if err := s.catalog.Save(req.TestCase, category); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, map[string]string{"id": req.ID, "category": category})
}
