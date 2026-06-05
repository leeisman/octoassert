package include

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"octoassert/internal/runner"
	"octoassert/internal/testcase"
)

type Action struct {
	FilePath string `json:"file_path"`
}

type Executor struct {
	registry *runner.Registry
}

func New(registry *runner.Registry) *Executor {
	return &Executor{registry: registry}
}

func (e *Executor) Type() string {
	return "include"
}

func (e *Executor) Execute(ctx context.Context, runCtx *runner.ExecutionContext, step testcase.Step) runner.StepResult {
	started := time.Now()
	res := runner.StepResult{
		StepID:      step.StepID,
		Description: step.Description,
		Type:        step.Type,
		StartedAt:   started,
		Status:      runner.StatusPassed,
	}

	action, err := runner.DecodeAction[Action](step)
	if err != nil {
		res.Status = runner.StatusFailed
		res.Error = "invalid action payload: " + err.Error()
		res.FinishedAt = time.Now()
		return res
	}

	fileBytes, err := os.ReadFile(action.FilePath)
	if err != nil {
		res.Status = runner.StatusFailed
		res.Error = "failed to read include file: " + err.Error()
		res.FinishedAt = time.Now()
		return res
	}

	ext := strings.ToLower(filepath.Ext(action.FilePath))
	switch ext {
	case ".yaml", ".yml":
		data, err := parseSimpleYAML(fileBytes)
		if err != nil {
			res.Status = runner.StatusFailed
			res.Error = "failed to parse yaml include file: " + err.Error()
			res.FinishedAt = time.Now()
			return res
		}
		payload, err := json.Marshal(data)
		if err != nil {
			res.Status = runner.StatusFailed
			res.Error = "failed to encode yaml include result: " + err.Error()
			res.FinishedAt = time.Now()
			return res
		}
		res.ResponseSummary = string(payload)
		res.FinishedAt = time.Now()
		res.ElapsedMS = res.FinishedAt.Sub(started).Milliseconds()
		return res
	}

	var subTC testcase.TestCase
	if err := json.Unmarshal(fileBytes, &subTC); err != nil {
		res.Status = runner.StatusFailed
		res.Error = "failed to parse include file: " + err.Error()
		res.FinishedAt = time.Now()
		return res
	}

	// Create a new runner with the same registry
	subRunner := runner.New(e.registry)

	// Execute the sub test case, passing the same execution context
	// This allows the sub test case to access existing variables and write new ones back
	// effectively inheriting and merging context variables as defined in the spec.
	subResult := subRunner.RunWithContext(ctx, runCtx, subTC, nil)

	if subResult.Status != runner.StatusPassed {
		res.Status = runner.StatusFailed
		res.Error = "sub test case failed"
	}

	// Bubble up exported context values from sub-steps.
	for _, step := range subResult.Steps {
		for k, v := range step.Values {
			if res.Values == nil {
				res.Values = make(map[string]any)
			}
			res.Values[k] = v
		}
	}

	res.ResponseSummary = "include executed successfully"
	res.FinishedAt = time.Now()
	res.ElapsedMS = res.FinishedAt.Sub(started).Milliseconds()

	return res
}

func parseSimpleYAML(data []byte) (map[string]any, error) {
	root := make(map[string]any)
	var currentSection string
	lines := strings.Split(string(data), "\n")
	for lineNo, rawLine := range lines {
		line := strings.TrimRight(rawLine, " \t\r")
		if strings.TrimSpace(line) == "" || strings.HasPrefix(strings.TrimSpace(line), "#") {
			continue
		}

		indent := len(rawLine) - len(strings.TrimLeft(rawLine, " "))
		parts := strings.SplitN(strings.TrimSpace(line), ":", 2)
		if len(parts) != 2 {
			return nil, fmt.Errorf("line %d: expected key/value", lineNo+1)
		}
		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(parts[1])
		if key == "" {
			return nil, fmt.Errorf("line %d: empty key", lineNo+1)
		}

		if indent == 0 {
			if value == "" {
				root[key] = make(map[string]any)
				currentSection = key
				continue
			}
			root[key] = parseScalar(value)
			currentSection = ""
			continue
		}

		if currentSection == "" {
			return nil, fmt.Errorf("line %d: nested key without section", lineNo+1)
		}
		section, ok := root[currentSection].(map[string]any)
		if !ok {
			return nil, fmt.Errorf("line %d: section %q is not an object", lineNo+1, currentSection)
		}
		section[key] = parseScalar(value)
	}
	return root, nil
}

func parseScalar(value string) any {
	value = strings.TrimSpace(value)
	if len(value) >= 2 {
		if (value[0] == '"' && value[len(value)-1] == '"') || (value[0] == '\'' && value[len(value)-1] == '\'') {
			return value[1 : len(value)-1]
		}
	}
	if i, err := strconv.ParseInt(value, 10, 64); err == nil {
		return i
	}
	if f, err := strconv.ParseFloat(value, 64); err == nil {
		return f
	}
	if b, err := strconv.ParseBool(value); err == nil {
		return b
	}
	return value
}
