package fakehttpserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"syscall"
	"time"

	"octoassert/internal/runner"
	"octoassert/internal/testcase"
)

// --- Global server pool ---

type serverEntry struct {
	server *http.Server
}

var (
	poolMu sync.RWMutex
	pool   = make(map[string]*serverEntry)
)

// --- Action models ---

type Route struct {
	Method string          `json:"method"`
	Path   string          `json:"path"`
	Status int             `json:"status"`
	Body   json.RawMessage `json:"body"`
}

type StartAction struct {
	Port   int     `json:"port"`
	Routes []Route `json:"routes"`
}

type StopAction struct {
	URL string `json:"url"`
}

// --- Executor ---

type Executor struct {
	stepType string
}

func New(stepType string) *Executor {
	return &Executor{stepType: stepType}
}

func (e *Executor) Type() string { return e.stepType }

func (e *Executor) Execute(ctx context.Context, _ *runner.ExecutionContext, step testcase.Step) runner.StepResult {
	started := time.Now()
	res := runner.StepResult{
		Name:      step.StepID,
		Type:      step.Type,
		StartedAt: started,
		Status:    runner.StatusPassed,
	}

	var err error
	switch e.stepType {
	case "fake_http_start":
		err = executeStart(ctx, step, &res)
	case "fake_http_stop":
		err = executeStop(step, &res)
	}

	if err != nil {
		res.Status = runner.StatusFailed
		res.Error = err.Error()
	}
	res.FinishedAt = time.Now()
	res.ElapsedMS = res.FinishedAt.Sub(started).Milliseconds()
	return res
}

func executeStart(ctx context.Context, step testcase.Step, res *runner.StepResult) error {
	action, err := runner.DecodeAction[StartAction](step)
	if err != nil {
		return err
	}
	url := fmt.Sprintf("http://localhost:%d", action.Port)
	stopExisting(url)

	mux := http.NewServeMux()
	for _, route := range action.Routes {
		r := route // capture
		mux.HandleFunc(r.Path, func(w http.ResponseWriter, req *http.Request) {
			if !strings.EqualFold(req.Method, r.Method) {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			status := r.Status
			if status == 0 {
				status = 200
			}
			w.WriteHeader(status)
			if len(r.Body) > 0 {
				w.Write(r.Body)
			}
		})
	}

	srv := &http.Server{Handler: mux}
	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", action.Port))
	if err != nil {
		if errors.Is(err, syscall.EADDRINUSE) {
			res.ResponseSummary = fmt.Sprintf(`{"url":"%s","reused_external":true}`, url)
			return nil
		}
		return fmt.Errorf("failed to listen on port %d: %w", action.Port, err)
	}

	poolMu.Lock()
	pool[url] = &serverEntry{server: srv}
	poolMu.Unlock()

	go srv.Serve(lis)

	res.ResponseSummary = fmt.Sprintf(`{"url":"%s"}`, url)
	return nil
}

func executeStop(step testcase.Step, res *runner.StepResult) error {
	action, err := runner.DecodeAction[StopAction](step)
	if err != nil {
		return err
	}

	poolMu.Lock()
	entry, ok := pool[action.URL]
	if ok {
		delete(pool, action.URL)
	}
	poolMu.Unlock()

	if !ok {
		res.ResponseSummary = `{"status":"not_found"}`
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	entry.server.Shutdown(ctx)

	res.ResponseSummary = `{"status":"stopped"}`
	return nil
}

func stopExisting(url string) {
	poolMu.Lock()
	entry, ok := pool[url]
	if ok {
		delete(pool, url)
	}
	poolMu.Unlock()

	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = entry.server.Shutdown(ctx)
}
