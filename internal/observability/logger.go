package observability

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"runtime"
	"time"
)

// InitLogger initializes the global slog instance.
func InitLogger() {
	format := os.Getenv("OCTOASSERT_LOG_FORMAT")
	if format == "" {
		// Default to JSON unless explicitly set
		format = "json"
	}

	opts := &slog.HandlerOptions{
		AddSource: true,
		Level:     slog.LevelInfo,
		ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
			if a.Key == slog.SourceKey {
				source, ok := a.Value.Any().(*slog.Source)
				if ok {
					dir := filepath.Base(filepath.Dir(source.File))
					base := filepath.Base(source.File)
					return slog.String(slog.SourceKey, fmt.Sprintf("%s/%s:%d", dir, base, source.Line))
				}
			}
			return a
		},
	}

	if lvl := os.Getenv("OCTOASSERT_LOG_LEVEL"); lvl == "debug" {
		opts.Level = slog.LevelDebug
	}

	var handler slog.Handler
	if format == "text" {
		handler = slog.NewTextHandler(os.Stdout, opts)
	} else {
		handler = slog.NewJSONHandler(os.Stdout, opts)
	}

	slog.SetDefault(slog.New(handler))
}

// withContextArgs appends run_id and step_id from context to the log arguments.
func withContextArgs(ctx context.Context, args []any) []any {
	if runID := RunIDFromContext(ctx); runID != "" {
		args = append(args, slog.String("run_id", runID))
	}
	if stepID := StepIDFromContext(ctx); stepID != "" {
		args = append(args, slog.String("step_id", stepID))
	}
	return args
}

func logAtLevel(ctx context.Context, level slog.Level, msg string, args ...any) {
	if !slog.Default().Enabled(ctx, level) {
		return
	}
	var pcs [1]uintptr
	// skip [Callers, logAtLevel, Info/Error/Warn/Debug]
	runtime.Callers(3, pcs[:])
	
	r := slog.NewRecord(time.Now(), level, msg, pcs[0])
	r.Add(withContextArgs(ctx, args)...)
	_ = slog.Default().Handler().Handle(ctx, r)
}

// Debug logs at debug level with context values attached.
func Debug(ctx context.Context, msg string, args ...any) {
	logAtLevel(ctx, slog.LevelDebug, msg, args...)
}

// Info logs at info level with context values attached.
func Info(ctx context.Context, msg string, args ...any) {
	logAtLevel(ctx, slog.LevelInfo, msg, args...)
}

// Warn logs at warn level with context values attached.
func Warn(ctx context.Context, msg string, args ...any) {
	logAtLevel(ctx, slog.LevelWarn, msg, args...)
}

// Error logs at error level with context values attached.
func Error(ctx context.Context, msg string, args ...any) {
	logAtLevel(ctx, slog.LevelError, msg, args...)
}
