package main

import (
	"fmt"
	"os"

	"octoassert/internal/consoleapp"
)

func main() {
	if len(os.Args) < 2 {
		printHelp()
		return
	}

	var err error
	switch os.Args[1] {
	case "server":
		err = runServerCommand(os.Args[2:])
	case "console", "serve":
		err = consoleapp.Run(os.Args[2:])
	case "help", "-h", "--help":
		printHelp()
		return
	default:
		fmt.Printf("unknown command: %s\n\n", os.Args[1])
		printHelp()
		os.Exit(1)
	}

	if err != nil {
		fmt.Printf("Error executing command: %v\n", err)
		os.Exit(1)
	}
}

func runServerCommand(args []string) error {
	if len(args) == 0 {
		printServerHelp()
		return nil
	}
	if args[0] != "console" {
		return fmt.Errorf("unknown server command: %s", args[0])
	}
	return consoleapp.Run(args[1:])
}

func printHelp() {
	fmt.Println(`Game Service Console

Usage:
  go run . server console [flags]
  go run . console [flags]
  go run . serve [flags]

Flags:
  -addr       web UI listen address, default 127.0.0.1:7788
  -testcases  test case directory, default testcases
  -db         SQLite database path, omit to use in-memory store

Examples:
  go run . server console --db data/runs.db
  go run . server console --addr 127.0.0.1:7790 --db data/runs.db`)
}

func printServerHelp() {
	fmt.Println(`Usage:
  go run . server console [flags]`)
}
