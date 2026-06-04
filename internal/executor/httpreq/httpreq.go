package httpreq

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"time"

	"octoassert/internal/runner"
	"octoassert/internal/testcase"
)

type Action struct {
	Method  string            `json:"method"`
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers"`
	Payload json.RawMessage   `json:"payload"`
}

type Executor struct {
	client *http.Client
}

func New() *Executor {
	return &Executor{
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

func (e *Executor) Type() string {
	return "http_request"
}

func (e *Executor) Execute(ctx context.Context, _ *runner.ExecutionContext, step testcase.Step) runner.StepResult {
	started := time.Now()
	res := runner.StepResult{
		Name:      step.StepID,
		Type:      step.Type,
		StartedAt: started,
		Status:    runner.StatusPassed,
	}

	action, err := runner.DecodeAction[Action](step)
	if err != nil {
		res.Status = runner.StatusFailed
		res.Error = "invalid action payload: " + err.Error()
		res.FinishedAt = time.Now()
		return res
	}

	var reqBody io.Reader
	if len(action.Payload) > 0 {
		reqBody = bytes.NewReader(action.Payload)
		res.RawPayload = action.Payload
	}

	req, err := http.NewRequestWithContext(ctx, action.Method, action.URL, reqBody)
	if err != nil {
		res.Status = runner.StatusFailed
		res.Error = "failed to create request: " + err.Error()
		res.FinishedAt = time.Now()
		return res
	}

	for k, v := range action.Headers {
		req.Header.Set(k, v)
	}

	resp, err := e.client.Do(req)
	res.FinishedAt = time.Now()
	res.ElapsedMS = res.FinishedAt.Sub(started).Milliseconds()

	if err != nil {
		res.Status = runner.StatusFailed
		res.Error = "http request failed: " + err.Error()
		return res
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	res.ResponseSummary = responseSummary(resp.StatusCode, bodyBytes)

	return res
}

func responseSummary(statusCode int, bodyBytes []byte) string {
	var body any
	if len(bodyBytes) == 0 {
		body = nil
	} else if err := json.Unmarshal(bodyBytes, &body); err != nil {
		body = string(bodyBytes)
	}

	payload, err := json.Marshal(map[string]any{
		"status_code": statusCode,
		"body":        body,
	})
	if err != nil {
		return `{}`
	}
	return string(payload)
}
