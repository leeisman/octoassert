package observability

import (
	"context"

	"github.com/google/uuid"
)

type contextKey string

const (
	runIDKey   contextKey = "run_id"
	stepIDKey  contextKey = "step_id"
)

// GenerateRunID creates a new unique run trace ID.
func GenerateRunID() string {
	return "run_" + uuid.New().String()
}

// WithRunID injects the Run ID into the context.
func WithRunID(ctx context.Context, runID string) context.Context {
	return context.WithValue(ctx, runIDKey, runID)
}

// RunIDFromContext extracts the Run ID from the context.
func RunIDFromContext(ctx context.Context) string {
	if val, ok := ctx.Value(runIDKey).(string); ok {
		return val
	}
	return ""
}

// WithStepID injects the Step ID into the context for finer grained tracing.
func WithStepID(ctx context.Context, stepID string) context.Context {
	return context.WithValue(ctx, stepIDKey, stepID)
}

// StepIDFromContext extracts the Step ID from the context.
func StepIDFromContext(ctx context.Context) string {
	if val, ok := ctx.Value(stepIDKey).(string); ok {
		return val
	}
	return ""
}
