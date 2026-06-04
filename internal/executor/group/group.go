package group

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"octoassert/internal/runner"
	"octoassert/internal/testcase"
)

type Action struct {
	File string `json:"file"`
}

type Executor struct {
	registry *runner.Registry
}

func New(registry *runner.Registry) *Executor {
	return &Executor{registry: registry}
}

func (e *Executor) Type() string { return "group" }

func (e *Executor) Execute(ctx context.Context, runCtx *runner.ExecutionContext, step testcase.Step) runner.StepResult {
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
		res.Error = "invalid action: " + err.Error()
		res.FinishedAt = time.Now()
		return res
	}

	fileBytes, err := os.ReadFile(action.File)
	if err != nil {
		res.Status = runner.StatusFailed
		res.Error = fmt.Sprintf("failed to read group file %s: %v", action.File, err)
		res.FinishedAt = time.Now()
		return res
	}

	var gf testcase.GroupFile
	if err := json.Unmarshal(fileBytes, &gf); err != nil {
		res.Status = runner.StatusFailed
		res.Error = fmt.Sprintf("failed to parse group file %s: %v", action.File, err)
		res.FinishedAt = time.Now()
		return res
	}

	if len(gf.Steps) == 0 {
		res.ResponseSummary = fmt.Sprintf(`{"group":"%s","steps":0}`, gf.Name)
		res.FinishedAt = time.Now()
		return res
	}

	// 展開 group steps，共享同一個 ExecutionContext
	subRunner := runner.New(e.registry)
	subTC := testcase.TestCase{
		ID:    gf.Name,
		Steps: gf.Steps,
	}
	subResult := subRunner.RunWithContext(ctx, runCtx, subTC)

	if subResult.Status != runner.StatusPassed {
		res.Status = runner.StatusFailed
		res.Error = fmt.Sprintf("group %q failed", gf.Name)
	}

	res.ResponseSummary = fmt.Sprintf(`{"group":"%s","status":"%s"}`, gf.Name, subResult.Status)
	res.FinishedAt = time.Now()
	res.ElapsedMS = res.FinishedAt.Sub(started).Milliseconds()
	return res
}
