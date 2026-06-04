package runner

import (
	"context"
	"encoding/json"

	"octoassert/internal/testcase"
)

type ExecutionContext struct {
	Values map[string]any
}

func NewExecutionContext() *ExecutionContext {
	return &ExecutionContext{Values: make(map[string]any)}
}

func (ctx *ExecutionContext) Set(name string, value any) {
	ctx.Values[name] = value
}

func (ctx *ExecutionContext) Get(name string) (any, bool) {
	v, ok := ctx.Values[name]
	return v, ok
}

type Executor interface {
	Type() string
	Execute(ctx context.Context, runCtx *ExecutionContext, step testcase.Step) StepResult
}

type Registry struct {
	executors map[string]Executor
}

func NewRegistry() *Registry {
	return &Registry{executors: make(map[string]Executor)}
}

func (r *Registry) Register(executor Executor) {
	r.executors[executor.Type()] = executor
}

func (r *Registry) Get(stepType string) (Executor, bool) {
	executor, ok := r.executors[stepType]
	return executor, ok
}

func DecodeAction[T any](step testcase.Step) (T, error) {
	var action T
	if len(step.Action) == 0 {
		return action, nil
	}
	err := json.Unmarshal(step.Action, &action)
	return action, err
}
