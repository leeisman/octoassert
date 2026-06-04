package main

import (
	"fmt"
	"os"

	"octoassert/internal/consoleapp"
)

func main() {
	if err := consoleapp.Run(os.Args[1:]); err != nil {
		fmt.Printf("Error executing command: %v\n", err)
		os.Exit(1)
	}
}
