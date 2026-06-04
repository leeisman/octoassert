package dbcheck

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	_ "github.com/go-sql-driver/mysql"
	_ "github.com/lib/pq"
	_ "modernc.org/sqlite"

	"octoassert/internal/runner"
	"octoassert/internal/testcase"
)

type Action struct {
	Driver string `json:"driver"`
	DSN    string `json:"dsn"`
	SQL    string `json:"sql"`
	Args   []any  `json:"args"`
}

type Executor struct{}

func New() *Executor {
	return &Executor{}
}

func (e *Executor) Type() string {
	return "db_check"
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
	res.RequestSummary = action.SQL
	res.RawPayload = encodeRawPayload(map[string]any{
		"sql":  action.SQL,
		"args": action.Args,
	})

	// 1. Connect to DB
	if action.Driver == "" {
		action.Driver = "postgres" // default
	}
	db, err := sql.Open(action.Driver, action.DSN)
	if err != nil {
		res.Status = runner.StatusFailed
		res.Error = "failed to open database: " + err.Error()
		res.FinishedAt = time.Now()
		return res
	}
	defer db.Close()

	// 2. Execute Query
	rows, err := db.QueryContext(ctx, action.SQL, action.Args...)
	if err != nil {
		res.Status = runner.StatusFailed
		res.Error = "query failed: " + err.Error()
		res.FinishedAt = time.Now()
		return res
	}
	defer rows.Close()

	// 3. Dynamic Field Mapping
	cols, err := rows.Columns()
	if err != nil {
		res.Status = runner.StatusFailed
		res.Error = "failed to get columns: " + err.Error()
		res.FinishedAt = time.Now()
		return res
	}

	var results []map[string]any

	for rows.Next() {
		// Create a slice of interface{} to hold the values
		columns := make([]interface{}, len(cols))
		columnPointers := make([]interface{}, len(cols))
		for i := range columns {
			columnPointers[i] = &columns[i]
		}

		// Scan the result into the column pointers
		if err := rows.Scan(columnPointers...); err != nil {
			res.Status = runner.StatusFailed
			res.Error = "failed to scan row: " + err.Error()
			res.FinishedAt = time.Now()
			return res
		}

		// Convert the typed row into a map
		rowMap := make(map[string]any)
		for i, colName := range cols {
			val := columnPointers[i].(*interface{})
			if *val != nil {
				// Handle byte slices (often used by DB drivers for strings/numbers depending on type)
				if b, ok := (*val).([]byte); ok {
					rowMap[colName] = string(b)
				} else {
					rowMap[colName] = *val
				}
			} else {
				rowMap[colName] = nil
			}
		}
		if results == nil {
			results = make([]map[string]any, 0)
		}
		results = append(results, rowMap)
	}

	if err := rows.Err(); err != nil {
		res.Status = runner.StatusFailed
		res.Error = "rows iteration error: " + err.Error()
		res.FinishedAt = time.Now()
		return res
	}

	// 4. Pack to JSON
	// Initialize an empty array if there are no results to ensure valid JSON array in ResponseSummary
	if results == nil {
		results = []map[string]any{}
	}

	summaryMap := map[string]any{
		"row_count": len(results),
		"rows":      results,
	}

	summaryBytes, _ := json.Marshal(summaryMap)
	res.ResponseSummary = string(summaryBytes)

	res.FinishedAt = time.Now()
	res.ElapsedMS = res.FinishedAt.Sub(started).Milliseconds()
	return res
}

func encodeRawPayload(value any) json.RawMessage {
	payload, err := json.Marshal(value)
	if err != nil {
		return nil
	}
	return payload
}
