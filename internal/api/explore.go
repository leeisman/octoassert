package api

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"

	"octoassert/internal/testcase"

	"github.com/jhump/protoreflect/grpcreflect"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// exploreServiceInfo describes a gRPC service and its methods discovered via reflection.
type exploreServiceInfo struct {
	Name    string   `json:"name"`    // short name, e.g. "ClassicalBaccarat"
	Full    string   `json:"full"`    // fully-qualified, e.g. "cbm.ClassicalBaccarat"
	Methods []string `json:"methods"` // method names, e.g. ["ReviveRoom", "HaltRoom"]
}

// handleExploreCategories returns the sorted list of unique categories already in the catalog.
func (s *Server) handleExploreCategories(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	categories, err := s.catalog.ListCategories()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, categories)
}

var skipServices = map[string]bool{
	"grpc.reflection.v1.ServerReflection":      true,
	"grpc.reflection.v1alpha.ServerReflection": true,
	"grpc.health.v1.Health":                    true,
}

// handleExploreReflect accepts POST {endpoint} and returns all services+methods via reflection.
func (s *Server) handleExploreReflect(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		Endpoint string `json:"endpoint"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Endpoint == "" {
		writeError(w, http.StatusBadRequest, "endpoint required")
		return
	}

	conn, err := grpc.NewClient(req.Endpoint, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		writeError(w, http.StatusBadRequest, "dial failed: "+err.Error())
		return
	}
	defer conn.Close()

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	refClient := grpcreflect.NewClientAuto(ctx, conn)
	defer refClient.Reset()

	svcs, err := refClient.ListServices()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "reflection error: "+err.Error())
		return
	}

	var result []exploreServiceInfo
	for _, svc := range svcs {
		if skipServices[svc] {
			continue
		}
		desc, err := refClient.ResolveService(svc)
		if err != nil {
			continue
		}
		var methods []string
		for _, m := range desc.GetMethods() {
			methods = append(methods, m.GetName())
		}
		parts := strings.Split(svc, ".")
		result = append(result, exploreServiceInfo{
			Name:    parts[len(parts)-1],
			Full:    svc,
			Methods: methods,
		})
	}
	writeJSON(w, result)
}

// handleExploreRun executes a single ad-hoc gRPC unary call and returns the step result.
func (s *Server) handleExploreRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		Endpoint string            `json:"endpoint"`
		Service  string            `json:"service"`
		Method   string            `json:"method"`
		Metadata map[string]string `json:"metadata"`
		Payload  json.RawMessage   `json:"payload"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	payload := req.Payload
	if len(payload) == 0 {
		payload = json.RawMessage(`{}`)
	}

	action, _ := json.Marshal(map[string]any{
		"endpoint": req.Endpoint,
		"service":  req.Service,
		"method":   req.Method,
		"metadata": req.Metadata,
		"payload":  payload,
	})

	tc := testcase.TestCase{
		ID:   "_adhoc",
		Name: "Ad-hoc",
		Steps: []testcase.Step{
			{StepID: "call", Type: "grpc_unary", Action: action},
		},
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	result := s.runner.Run(ctx, tc)
	if len(result.Steps) == 0 {
		writeError(w, http.StatusInternalServerError, "no result")
		return
	}
	writeJSON(w, result.Steps[0])
}

// handleExploreSave saves the current ad-hoc call as a test case JSON file.
func (s *Server) handleExploreSave(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		Name        string            `json:"name"`
		Description string            `json:"description"`
		Category    string            `json:"category"`
		Endpoint    string            `json:"endpoint"`
		Service     string            `json:"service"`
		Method      string            `json:"method"`
		Metadata    map[string]string `json:"metadata"`
		Payload     json.RawMessage   `json:"payload"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	id := slugify(req.Name)
	if id == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	payload := req.Payload
	if len(payload) == 0 {
		payload = json.RawMessage(`{}`)
	}

	actionMap := map[string]any{
		"endpoint": req.Endpoint,
		"service":  req.Service,
		"method":   req.Method,
		"payload":  payload,
	}
	if len(req.Metadata) > 0 {
		actionMap["metadata"] = req.Metadata
	}
	actionBytes, _ := json.Marshal(actionMap)

	category := strings.TrimSpace(req.Category)
	if category == "" {
		category = "explore"
	}

	tc := testcase.TestCase{
		ID:          id,
		Name:        req.Name,
		Description: req.Description,
		Config:      testcase.Config{TimeoutMS: 30000},
		Steps: []testcase.Step{
			{
				StepID:      "call",
				Type:        "grpc_unary",
				Description: req.Service + "/" + req.Method,
				Action:      actionBytes,
			},
		},
	}

	if err := s.catalog.Save(tc, category); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, map[string]string{"id": id, "category": category})
}

func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	re := regexp.MustCompile(`[^a-z0-9]+`)
	s = re.ReplaceAllString(s, "_")
	return strings.Trim(s, "_")
}
