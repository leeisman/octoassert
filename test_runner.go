//go:build ignore

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"octoassert/internal/executor"
	"octoassert/internal/runner"
	"octoassert/internal/testcase"
)

func main() {
	fileBytes, err := os.ReadFile("test_grpc.json")
	if err != nil {
		panic(err)
	}

	var tc testcase.TestCase
	if err := json.Unmarshal(fileBytes, &tc); err != nil {
		panic(err)
	}

	registry := executor.NewRegistry()
	r := runner.New(registry)

	result := r.Run(context.Background(), tc)

	resBytes, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(resBytes))
}
