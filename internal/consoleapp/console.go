package consoleapp

import (
	"flag"
	"fmt"
	"log"
	"net/http"

	"octoassert/internal/api"
	"octoassert/internal/catalog"
	"octoassert/internal/executor"
	"octoassert/internal/runner"
	"octoassert/internal/store"
)

func Run(args []string) error {
	flags := flag.NewFlagSet("console", flag.ExitOnError)
	addr := flags.String("addr", "127.0.0.1:7788", "web UI listen address")
	testcasesDir := flags.String("testcases", "testcases", "test case directory")
	dbPath := flags.String("db", "", "SQLite database path (e.g. data/runs.db); omit to use in-memory store")
	if err := flags.Parse(args); err != nil {
		return err
	}

	registry := executor.NewRegistry()
	appRunner := runner.New(registry)
	appCatalog := catalog.New(*testcasesDir)

	var runStore store.Store
	if *dbPath != "" {
		s, err := store.NewSQLite(*dbPath)
		if err != nil {
			return fmt.Errorf("failed to open SQLite store: %w", err)
		}
		runStore = s
		fmt.Printf("Run store: SQLite (%s)\n", *dbPath)
	} else {
		runStore = store.NewMemory()
		fmt.Println("Run store: in-memory (runs will be lost on restart)")
	}

	server := api.New(appCatalog, appRunner, runStore)

	url := "http://" + *addr
	fmt.Printf("Game Service Console listening on %s\n", url)
	fmt.Printf("Test cases: %s\n", *testcasesDir)

	if err := http.ListenAndServe(*addr, server.Handler()); err != nil {
		log.Print(err)
		return err
	}
	return nil
}
