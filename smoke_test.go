package main

import (
	"context"
	"encoding/json"
	"os"
	"testing"

	"octoassert/internal/executor"
	"octoassert/internal/runner"
	"octoassert/internal/testcase"
)

func TestFakeGrpcUnarySmoke(t *testing.T) {
	registry := executor.NewRegistry()
	r := runner.New(registry)

	tc := testcase.TestCase{
		ID: "fake_grpc_unary_smoke",
		Steps: []testcase.Step{
			{
				StepID: "start_grpc",
				Type:   "fake_grpc_start",
				Action: []byte(`{
					"port": 19190,
					"proto_files": ["proto/fake/service.proto"],
					"responses": {
						"FakeService/GetStatus": { "status": "ok", "code": 0 }
					}
				}`),
			},
			{
				StepID: "grpc_get_status",
				Type:   "grpc_unary",
				Action: []byte(`{
					"endpoint": "localhost:19190",
					"service": "FakeService",
					"method": "GetStatus",
					"payload": {}
				}`),
				Assertions: []testcase.Assertion{
					{Type: "json_path", Path: "grpc_code", Expect: "OK"},
					{Type: "json_path", Path: "response.status", Expect: "ok"},
					{Type: "json_path", Path: "response.code", Expect: 0},
				},
			},
			{
				StepID: "stop_grpc",
				Type:   "fake_grpc_stop",
				Action: []byte(`{"addr":"localhost:19190"}`),
			},
		},
	}

	result := r.Run(context.Background(), tc)
	if result.Status != runner.StatusPassed {
		t.Fatalf("smoke failed: %+v", result)
	}
}

func TestSampleGrpcUnary(t *testing.T) {
	assertTestCasePasses(t, "testcases/fake/sample/sample_grpc.json")
}

func TestSampleDBCheck(t *testing.T) {
	result := runTestCase(t, "testcases/fake/sample/sample_db_check.json")
	if result.Status != runner.StatusPassed {
		t.Fatalf("sample db check failed: %+v", result)
	}
	if _, err := json.Marshal(result); err != nil {
		t.Fatalf("sample db check result must be valid API JSON: %v", err)
	}
}

func TestSampleGroup(t *testing.T) {
	assertTestCasePasses(t, "testcases/fake/sample/sample_group.json")
}

func assertTestCasePasses(t *testing.T, path string) {
	t.Helper()
	result := runTestCase(t, path)
	if result.Status != runner.StatusPassed {
		t.Fatalf("%s failed: %+v", path, result)
	}
}

func runTestCase(t *testing.T, path string) runner.RunResult {
	t.Helper()

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}

	var tc testcase.TestCase
	if err := json.Unmarshal(data, &tc); err != nil {
		t.Fatal(err)
	}

	registry := executor.NewRegistry()
	r := runner.New(registry)

	result := r.Run(context.Background(), tc)
	return result
}
