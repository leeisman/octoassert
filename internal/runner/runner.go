package runner

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"octoassert/internal/testcase"
	"octoassert/pkg/jsonpath"
)

type Runner struct {
	registry *Registry
}

func New(registry *Registry) *Runner {
	return &Runner{registry: registry}
}

func (r *Runner) Run(ctx context.Context, tc testcase.TestCase) RunResult {
	return r.RunWithCallback(ctx, tc, nil)
}

func (r *Runner) RunWithCallback(ctx context.Context, tc testcase.TestCase, cb func(int, string)) RunResult {
	runCtx := NewExecutionContext()
	return r.RunWithContext(ctx, runCtx, tc, cb)
}

func (r *Runner) RunWithContext(ctx context.Context, runCtx *ExecutionContext, tc testcase.TestCase, cb func(int, string)) RunResult {
	started := time.Now()
	result := RunResult{
		TestCaseID: tc.ID,
		Status:     StatusPassed,
		StartedAt:  started,
	}

	for i, step := range tc.Steps {
		if cb != nil {
			cb(i, "running")
		}
		executor, ok := r.registry.Get(step.Type)
		if !ok {
			stepResult := failedStep(step, fmt.Errorf("executor not registered: %s", step.Type))
			result.Steps = append(result.Steps, stepResult)
			result.Status = StatusFailed
			break
		}

		// Inject context variables into Action payload before execution
		if len(step.Action) > 0 {
			step.Action = InjectContext(step.Action, runCtx)
		}

		stepResult := executor.Execute(ctx, runCtx, step)
		stepResult.Request = &StepRequest{
			Description: step.Description,
			Action:      step.Action,
			Assertions:  step.Assertions,
			Exports:     step.Exports,
		}

		// 1. Process Assertions
		if stepResult.Status == StatusPassed {
			for _, ast := range step.Assertions {
				if ast.Type == "json_path" {
					ok, err := jsonpath.Assert(stepResult.ResponseSummary, ast.Path, ast.Expect)
					if err != nil || !ok {
						stepResult.Status = StatusFailed
						if err != nil {
							stepResult.Error = fmt.Sprintf("Assertion error: %v", err)
						} else {
							stepResult.Error = fmt.Sprintf("Assertion failed for path %s", ast.Path)
						}
						break
					}
				}
				// Other assertion types (e.g. grpc_code, http_status) should be handled by their respective executors
				// or generalized here. For simplicity, we just handle json_path explicitly.
			}
		}

		// 2. Process Exports
		if stepResult.Status == StatusPassed {
			for _, exp := range step.Exports {
				val, err := jsonpath.Extract(stepResult.ResponseSummary, exp.Path)
				if err == nil {
					runCtx.Set(exp.As, val)
					// Record the extracted value in the step result for visibility
					if stepResult.Values == nil {
						stepResult.Values = make(map[string]any)
					}
					stepResult.Values[exp.As] = val
				}
			}
		}

		result.Steps = append(result.Steps, stepResult)
		if cb != nil {
			if stepResult.Status == StatusPassed {
				cb(i, "passed")
			} else {
				cb(i, "failed")
			}
		}
		if stepResult.Status != StatusPassed {
			result.Status = StatusFailed
			break
		}
	}

	result.FinishedAt = time.Now()
	result.ElapsedMS = result.FinishedAt.Sub(started).Milliseconds()
	return result
}

func failedStep(step testcase.Step, err error) StepResult {
	now := time.Now()
	return StepResult{
		StepID:     step.StepID,
		Type:       step.Type,
		Status:     StatusFailed,
		StartedAt:  now,
		FinishedAt: now,
		Error:      err.Error(),
	}
}

// InjectContext scans the raw JSON action for ${ctx.xxx} and replaces it with values from the context pool.
func InjectContext(action []byte, runCtx *ExecutionContext) []byte {
	var parsed any
	if err := json.Unmarshal(action, &parsed); err == nil {
		replaced := replaceContextValue(parsed, runCtx)
		if encoded, err := json.Marshal(replaced); err == nil {
			return encoded
		}
	}

	actionStr := string(action)
	re := regexp.MustCompile(`\$\{ctx\.([^}]+)\}`)
	matches := re.FindAllStringSubmatch(actionStr, -1)

	for _, match := range matches {
		if len(match) == 2 {
			fullMatch := match[0]
			varName := match[1]
			if val, ok := resolveContextValue(varName, runCtx); ok {
				actionStr = strings.ReplaceAll(actionStr, fullMatch, fmt.Sprint(val))
			}
		}
	}
	return []byte(actionStr)
}

func replaceContextValue(value any, runCtx *ExecutionContext) any {
	switch v := value.(type) {
	case map[string]any:
		for key, item := range v {
			v[key] = replaceContextValue(item, runCtx)
		}
		return v
	case []any:
		for i, item := range v {
			v[i] = replaceContextValue(item, runCtx)
		}
		return v
	case string:
		return replaceContextString(v, runCtx)
	default:
		return v
	}
}

func replaceContextString(value string, runCtx *ExecutionContext) any {
	re := regexp.MustCompile(`^\$\{ctx\.([^}]+)\}$`)
	if match := re.FindStringSubmatch(value); len(match) == 2 {
		if val, ok := resolveContextValue(match[1], runCtx); ok {
			return val
		}
		return value
	}

	inlineRe := regexp.MustCompile(`\$\{ctx\.([^}]+)\}`)
	return inlineRe.ReplaceAllStringFunc(value, func(token string) string {
		match := inlineRe.FindStringSubmatch(token)
		if len(match) != 2 {
			return token
		}
		if val, ok := resolveContextValue(match[1], runCtx); ok {
			return fmt.Sprint(val)
		}
		return token
	})
}

func resolveContextValue(name string, runCtx *ExecutionContext) (any, bool) {
	candidates := []string{"ctx." + name, name}
	if strings.HasPrefix(name, "ctx.") {
		candidates = append(candidates, strings.TrimPrefix(name, "ctx."))
	}
	for _, candidate := range candidates {
		if val, ok := runCtx.Get(candidate); ok {
			return val, true
		}
	}
	return nil, false
}
