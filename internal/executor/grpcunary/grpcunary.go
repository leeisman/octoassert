package grpcunary

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/golang/protobuf/jsonpb"
	"github.com/jhump/protoreflect/desc"
	"github.com/jhump/protoreflect/desc/protoparse"
	"github.com/jhump/protoreflect/dynamic"
	"github.com/jhump/protoreflect/dynamic/grpcdynamic"
	"github.com/jhump/protoreflect/grpcreflect"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"

	"octoassert/internal/runner"
	"octoassert/internal/testcase"
)

type Action struct {
	Endpoint   string            `json:"endpoint"`
	Service    string            `json:"service"`
	Method     string            `json:"method"`
	Metadata   map[string]string `json:"metadata"`
	ProtoFiles []string          `json:"proto_files"`
	Payload    json.RawMessage   `json:"payload"`
}

type Executor struct{}

func New() *Executor {
	return &Executor{}
}

func (e *Executor) Type() string {
	return "grpc_unary"
}

func (e *Executor) Execute(ctx context.Context, _ *runner.ExecutionContext, step testcase.Step) runner.StepResult {
	started := time.Now()
	res := runner.StepResult{
		StepID:   step.StepID,
		Description: step.Description,
		Type:      step.Type,
		StartedAt: started,
		Status:    runner.StatusPassed,
	}
	finish := func() {
		res.FinishedAt = time.Now()
		res.ElapsedMS = res.FinishedAt.Sub(started).Milliseconds()
	}

	action, err := runner.DecodeAction[Action](step)
	if err != nil {
		res.Status = runner.StatusFailed
		res.Error = "invalid action payload: " + err.Error()
		finish()
		return res
	}

	res.RawPayload = action.Payload

	// 1. Dial gRPC connection
	conn, err := grpc.NewClient(action.Endpoint, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		res.Status = runner.StatusFailed
		res.Error = "failed to dial endpoint: " + err.Error()
		finish()
		return res
	}
	defer conn.Close()

	// 2. Setup Reflection Client
	refCtx, refCancel := context.WithTimeout(ctx, 5*time.Second)
	defer refCancel()
	refClient := grpcreflect.NewClientAuto(refCtx, conn)
	defer refClient.Reset()

	// 3. Resolve Service and Method
	svcDesc, err := resolveService(refClient, action.Service, action.ProtoFiles)
	if err != nil {
		res.Status = runner.StatusFailed
		res.Error = fmt.Sprintf("failed to resolve service %s: %v", action.Service, err)
		finish()
		return res
	}
	mtdDesc := svcDesc.FindMethodByName(action.Method)
	if mtdDesc == nil {
		res.Status = runner.StatusFailed
		res.Error = fmt.Sprintf("method %s not found in service %s", action.Method, action.Service)
		finish()
		return res
	}

	// 4. Prepare Dynamic Message from JSON Payload
	reqMsg := dynamic.NewMessage(mtdDesc.GetInputType())
	if len(action.Payload) > 0 {
		err = reqMsg.UnmarshalJSON(action.Payload)
		if err != nil {
			res.Status = runner.StatusFailed
			res.Error = "failed to parse JSON payload into protobuf: " + err.Error()
			finish()
			return res
		}
	}

	// 5. Setup Metadata (Headers)
	md := metadata.New(action.Metadata)
	outCtx := metadata.NewOutgoingContext(ctx, md)

	// 6. Invoke via grpcdynamic
	stub := grpcdynamic.NewStub(conn)
	respMsg, rpcErr := stub.InvokeRpc(outCtx, mtdDesc, reqMsg)

	finish()

	// 7. Process Response and Errors
	responseBody := map[string]any{}
	if respMsg != nil {
		respBytes, marshalErr := respMsg.(*dynamic.Message).MarshalJSONPB(&jsonpb.Marshaler{EmitDefaults: true, OrigName: true})
		if marshalErr == nil {
			res.ResponseSummary = string(respBytes)
			if len(respBytes) > 0 {
				_ = json.Unmarshal(respBytes, &responseBody)
			}
		}
	}

	if rpcErr != nil {
		// Capture gRPC Status code and message
		st, ok := status.FromError(rpcErr)
		if ok {
			// Even if gRPC returns an error (e.g., NotFound), the Runner might expect it.
			// However, by default, if it's an error, we mark the step as failed,
			// unless we implement explicit 'grpc_code' assertions later.
			res.Error = fmt.Sprintf("gRPC error: code=%s desc=%s", st.Code().String(), st.Message())

			writeResponseSummary(&res, map[string]any{
				"grpc_code": st.Code().String(),
				"grpc_desc": st.Message(),
				"response":  responseBody,
			})
		} else {
			res.Error = "invocation failed: " + rpcErr.Error()
		}
		// Currently failing step on any RPC error.
		// If testing requires asserting on errors, we could mark it passed and let Asserts handle it.
		// Let's mark it as passed initially so Asserts can catch it, or if there is an error, just fail it?
		// Usually a non-OK status fails the step unless expected. We'll fail it.
		// To allow expecting errors, the user would need to add something to the Action or we just don't fail it here.
		// Let's just fail it if there's an error for now.
		res.Status = runner.StatusFailed
	} else {
		// Successful call
		// Also inject grpc_code: OK for unified assertions
		writeResponseSummary(&res, map[string]any{
			"grpc_code": "OK",
			"response":  responseBody,
		})
	}

	return res
}

func writeResponseSummary(res *runner.StepResult, body map[string]any) {
	payload, err := json.Marshal(body)
	if err != nil {
		res.ResponseSummary = `{}`
		return
	}
	res.ResponseSummary = string(payload)
}

func resolveService(refClient *grpcreflect.Client, service string, protoFiles []string) (*desc.ServiceDescriptor, error) {
	services, listErr := refClient.ListServices()
	if listErr == nil {
		for _, candidate := range services {
			if candidate == service || strings.HasSuffix(candidate, "."+service) {
				return refClient.ResolveService(candidate)
			}
		}
		if svcDesc, err := refClient.ResolveService(service); err == nil {
			return svcDesc, nil
		} else if len(protoFiles) == 0 {
			return nil, err
		}
	} else if len(protoFiles) == 0 {
		return nil, listErr
	}

	svcDesc, protoErr := resolveServiceFromProtoFiles(service, protoFiles)
	if protoErr != nil {
		if listErr != nil {
			return nil, fmt.Errorf("%v; proto fallback failed: %w", listErr, protoErr)
		}
		return nil, protoErr
	}
	return svcDesc, nil
}

func resolveServiceFromProtoFiles(service string, protoFiles []string) (*desc.ServiceDescriptor, error) {
	parser := protoparse.Parser{
		ImportPaths:           []string{".", ".."},
		InferImportPaths:      true,
		IncludeSourceCodeInfo: false,
	}
	fds, err := parser.ParseFiles(protoFiles...)
	if err != nil {
		return nil, fmt.Errorf("failed to parse proto_files: %w", err)
	}
	for _, fd := range fds {
		if svcDesc := findService(fd, service); svcDesc != nil {
			return svcDesc, nil
		}
	}
	return nil, fmt.Errorf("service not found in proto_files: %s", service)
}

func findService(fd *desc.FileDescriptor, service string) *desc.ServiceDescriptor {
	for _, svc := range fd.GetServices() {
		if svc.GetFullyQualifiedName() == service || svc.GetName() == service || strings.HasSuffix(svc.GetFullyQualifiedName(), "."+service) {
			return svc
		}
	}
	for _, dep := range fd.GetDependencies() {
		if svc := findService(dep, service); svc != nil {
			return svc
		}
	}
	return nil
}
