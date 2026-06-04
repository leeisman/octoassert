package store

import (
	"database/sql"
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"time"

	"octoassert/internal/runner"

	_ "modernc.org/sqlite"
)

type SQLite struct {
	db *sql.DB
}

func NewSQLite(path string) (*SQLite, error) {
	if dir := filepath.Dir(path); dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, err
		}
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	if err := migrate(db); err != nil {
		return nil, err
	}
	return &SQLite{db: db}, nil
}

func migrate(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS runs (
			id           INTEGER PRIMARY KEY AUTOINCREMENT,
			test_case_id TEXT     NOT NULL,
			status       TEXT     NOT NULL,
			started_at   DATETIME NOT NULL,
			finished_at  DATETIME NOT NULL,
			elapsed_ms   INTEGER  NOT NULL,
			steps_json   TEXT     NOT NULL
		)
	`)
	return err
}

func (s *SQLite) Save(run runner.RunResult) {
	stepsJSON, err := json.Marshal(run.Steps)
	if err != nil {
		log.Printf("store/sqlite: failed to marshal steps: %v", err)
		return
	}
	_, err = s.db.Exec(
		`INSERT INTO runs (test_case_id, status, started_at, finished_at, elapsed_ms, steps_json)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		run.TestCaseID,
		string(run.Status),
		run.StartedAt.UTC().Format(time.RFC3339Nano),
		run.FinishedAt.UTC().Format(time.RFC3339Nano),
		run.ElapsedMS,
		string(stepsJSON),
	)
	if err != nil {
		log.Printf("store/sqlite: failed to save run: %v", err)
	}
}

func (s *SQLite) List() []runner.RunResult {
	rows, err := s.db.Query(
		`SELECT test_case_id, status, started_at, finished_at, elapsed_ms, steps_json
		 FROM runs ORDER BY started_at DESC`,
	)
	if err != nil {
		log.Printf("store/sqlite: failed to list runs: %v", err)
		return nil
	}
	defer rows.Close()

	var results []runner.RunResult
	for rows.Next() {
		var (
			testCaseID  string
			status      string
			startedAt   string
			finishedAt  string
			elapsedMS   int64
			stepsJSON   string
		)
		if err := rows.Scan(&testCaseID, &status, &startedAt, &finishedAt, &elapsedMS, &stepsJSON); err != nil {
			log.Printf("store/sqlite: failed to scan row: %v", err)
			continue
		}
		started, _ := time.Parse(time.RFC3339Nano, startedAt)
		finished, _ := time.Parse(time.RFC3339Nano, finishedAt)

		var steps []runner.StepResult
		_ = json.Unmarshal([]byte(stepsJSON), &steps)

		results = append(results, runner.RunResult{
			TestCaseID: testCaseID,
			Status:     runner.Status(status),
			StartedAt:  started,
			FinishedAt: finished,
			ElapsedMS:  elapsedMS,
			Steps:      steps,
		})
	}
	return results
}
