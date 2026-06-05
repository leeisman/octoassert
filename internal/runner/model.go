package runner

import (
	"encoding/json"
	"time"

	"octoassert/internal/testcase"
)

type Status string

const (
	StatusPassed Status = "passed"
	StatusFailed Status = "failed"
)

type RunResult struct {
	TestCaseID string       `json:"test_case_id"`
	Status     Status       `json:"status"`
	StartedAt  time.Time    `json:"started_at"`
	FinishedAt time.Time    `json:"finished_at"`
	ElapsedMS  int64        `json:"elapsed_ms"`
	Steps      []StepResult `json:"steps"`
}

type StepResult struct {
	StepID          string          `json:"step_id"`
	Description     string          `json:"description,omitempty"`
	Type            string          `json:"type"`
	Status          Status          `json:"status"`
	StartedAt       time.Time       `json:"started_at"`
	FinishedAt      time.Time       `json:"finished_at"`
	ElapsedMS       int64           `json:"elapsed_ms"`
	RequestSummary  string          `json:"request_summary,omitempty"`
	Request         *StepRequest    `json:"request,omitempty"`
	ResponseSummary string          `json:"response_summary,omitempty"`
	RawPayload      json.RawMessage `json:"raw_payload,omitempty"`
	Error           string          `json:"error,omitempty"`
	Values          map[string]any  `json:"values,omitempty"`
}

type StepRequest struct {
	Description string               `json:"description,omitempty"`
	Action      json.RawMessage      `json:"action,omitempty"`
	Assertions  []testcase.Assertion `json:"asserts,omitempty"`
	Exports     []testcase.Export    `json:"exports,omitempty"`
}
