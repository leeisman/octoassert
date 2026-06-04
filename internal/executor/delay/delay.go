package delay

import (
	"context"
	"time"

	"octoassert/internal/runner"
	"octoassert/internal/testcase"
)

type Executor struct{}

type action struct {
	DurationMS int `json:"duration_ms"`
}

func New() *Executor {
	return &Executor{}
}

func (e *Executor) Type() string {
	return "delay"
}

func (e *Executor) Execute(ctx context.Context, _ *runner.ExecutionContext, step testcase.Step) runner.StepResult {
	started := time.Now()
	result := runner.StepResult{
		Name:      step.StepID,
		Type:      step.Type,
		Status:    runner.StatusPassed,
		StartedAt: started,
	}
	finish := func() runner.StepResult {
		result.FinishedAt = time.Now()
		result.ElapsedMS = result.FinishedAt.Sub(started).Milliseconds()
		return result
	}

	act, err := runner.DecodeAction[action](step)
	if err != nil {
		result.Status = runner.StatusFailed
		result.Error = err.Error()
		return finish()
	}
	if act.DurationMS < 0 {
		result.Status = runner.StatusFailed
		result.Error = "duration_ms must be >= 0"
		return finish()
	}

	timer := time.NewTimer(time.Duration(act.DurationMS) * time.Millisecond)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		result.Status = runner.StatusFailed
		result.Error = ctx.Err().Error()
	case <-timer.C:
		result.ResponseSummary = "delay completed"
	}
	return finish()
}
