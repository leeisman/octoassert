package fakegrpcserver

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/jhump/protoreflect/desc"
	"github.com/jhump/protoreflect/desc/protoparse"
	"github.com/jhump/protoreflect/dynamic"
	"github.com/jhump/protoreflect/grpcreflect"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/reflection"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoregistry"

	"octoassert/internal/runner"
	"octoassert/internal/testcase"
)

// --- Global server pool ---

type serverEntry struct {
	server *grpc.Server
}

var (
	poolMu sync.RWMutex
	pool   = make(map[string]*serverEntry)
)

// --- Action models ---

type StartAction struct {
	Port       int                        `json:"port"`
	ProtoFiles []string                   `json:"proto_files"`
	Responses  map[string]json.RawMessage `json:"responses"` // "ServiceName/MethodName" -> JSON body
}

type StopAction struct {
	Addr string `json:"addr"`
}

// --- Executor ---

type Executor struct {
	stepType string
}

func New(stepType string) *Executor {
	return &Executor{stepType: stepType}
}

func (e *Executor) Type() string { return e.stepType }

func (e *Executor) Execute(ctx context.Context, _ *runner.ExecutionContext, step testcase.Step) runner.StepResult {
	started := time.Now()
	res := runner.StepResult{
		Name:      step.StepID,
		Type:      step.Type,
		StartedAt: started,
		Status:    runner.StatusPassed,
	}

	var err error
	switch e.stepType {
	case "fake_grpc_start":
		err = executeStart(ctx, step, &res)
	case "fake_grpc_stop":
		err = executeStop(step, &res)
	}

	if err != nil {
		res.Status = runner.StatusFailed
		res.Error = err.Error()
	}
	res.FinishedAt = time.Now()
	res.ElapsedMS = res.FinishedAt.Sub(started).Milliseconds()
	return res
}

func executeStart(ctx context.Context, step testcase.Step, res *runner.StepResult) error {
	action, err := runner.DecodeAction[StartAction](step)
	if err != nil {
		return err
	}
	addr := fmt.Sprintf("localhost:%d", action.Port)
	stopExisting(addr)

	// 1. Parse proto files
	parser := protoparse.Parser{
		ImportPaths:           []string{"."},
		InferImportPaths:      true,
		IncludeSourceCodeInfo: false,
	}
	fds, err := parser.ParseFiles(action.ProtoFiles...)
	if err != nil {
		return fmt.Errorf("failed to parse proto files: %w", err)
	}
	registerFileDescriptors(fds)

	// 2. Build response lookup and service descriptors
	// key: "ServiceName/MethodName"
	responses := action.Responses

	// 3. Start gRPC server with unknown service handler
	srv := grpc.NewServer(
		grpc.UnknownServiceHandler(func(srv interface{}, stream grpc.ServerStream) error {
			// Extract full method: /package.ServiceName/MethodName
			method, ok := grpc.MethodFromServerStream(stream)
			if !ok {
				return status.Error(codes.Internal, "cannot determine method")
			}
			// method is "/pkg.Service/Method", extract "Service/Method"
			parts := strings.SplitN(strings.TrimPrefix(method, "/"), "/", 2)
			if len(parts) != 2 {
				return status.Error(codes.Unimplemented, "unknown method")
			}
			// parts[0] may be "pkg.ServiceName", we want just "ServiceName"
			svcFull := parts[0]
			methodName := parts[1]
			svcName := svcFull
			if idx := strings.LastIndex(svcFull, "."); idx >= 0 {
				svcName = svcFull[idx+1:]
			}
			key := svcName + "/" + methodName

			// Find method descriptor to decode request
			if rawResp, ok := responses[key]; ok {
				// Find method descriptor in parsed file descriptors
				for _, fd := range fds {
					for _, svc := range fd.GetServices() {
						if svc.GetName() == svcName {
							mtd := svc.FindMethodByName(methodName)
							if mtd != nil {
								// Decode incoming request (ignore content, just drain)
								reqMsg := dynamic.NewMessage(mtd.GetInputType())
								if err := stream.RecvMsg(reqMsg); err != nil {
									return err
								}
								// Build response from configured JSON
								respMsg := dynamic.NewMessage(mtd.GetOutputType())
								if err := respMsg.UnmarshalJSON(rawResp); err != nil {
									return status.Errorf(codes.Internal, "invalid response config: %v", err)
								}
								return stream.SendMsg(respMsg)
							}
						}
					}
				}
			}

			// No configured response - drain request and return empty
			stream.RecvMsg(&rawProtoMsg{})
			return status.Errorf(codes.Unimplemented, "fake response not found: %s", key)
		}),
	)

	// 4. Register reflection using parsed file descriptors
	for _, fd := range fds {
		for _, svc := range fd.GetServices() {
			grpcServiceDesc := &grpc.ServiceDesc{
				ServiceName: fullyQualifiedServiceName(fd, svc),
				Methods:     methodDescsForService(svc, responses),
				Metadata:    fd.GetName(),
			}
			srv.RegisterService(grpcServiceDesc, nil)
		}
	}
	reflection.Register(srv)

	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", action.Port))
	if err != nil {
		return fmt.Errorf("failed to listen on port %d: %w", action.Port, err)
	}

	poolMu.Lock()
	pool[addr] = &serverEntry{server: srv}
	poolMu.Unlock()

	go srv.Serve(lis)

	if err := waitForReflection(ctx, addr); err != nil {
		stopServer(srv)
		poolMu.Lock()
		delete(pool, addr)
		poolMu.Unlock()
		return err
	}

	res.ResponseSummary = fmt.Sprintf(`{"addr":"%s"}`, addr)
	return nil
}

func waitForReflection(ctx context.Context, addr string) error {
	readyCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return fmt.Errorf("failed to create readiness client: %w", err)
	}
	defer conn.Close()

	refClient := grpcreflect.NewClientAuto(readyCtx, conn)
	defer refClient.Reset()
	if _, err := refClient.ListServices(); err != nil {
		return fmt.Errorf("fake grpc server not ready for reflection: %w", err)
	}
	return nil
}

func methodDescsForService(svc *desc.ServiceDescriptor, responses map[string]json.RawMessage) []grpc.MethodDesc {
	methods := svc.GetMethods()
	methodDescs := make([]grpc.MethodDesc, 0, len(methods))
	for _, mtd := range methods {
		method := mtd
		methodDescs = append(methodDescs, grpc.MethodDesc{
			MethodName: method.GetName(),
			Handler: func(_ any, _ context.Context, dec func(any) error, _ grpc.UnaryServerInterceptor) (any, error) {
				reqMsg := dynamic.NewMessage(method.GetInputType())
				if err := dec(reqMsg); err != nil {
					return nil, err
				}

				key := svc.GetName() + "/" + method.GetName()
				rawResp, ok := responses[key]
				if !ok {
					return nil, status.Errorf(codes.Unimplemented, "fake response not found: %s", key)
				}

				respMsg := dynamic.NewMessage(method.GetOutputType())
				if err := respMsg.UnmarshalJSON(rawResp); err != nil {
					return nil, status.Errorf(codes.Internal, "invalid response config: %v", err)
				}
				return respMsg, nil
			},
		})
	}
	return methodDescs
}

func registerFileDescriptors(fds []*desc.FileDescriptor) {
	for _, fd := range fds {
		if _, err := protoregistry.GlobalFiles.FindFileByPath(fd.GetName()); err == nil {
			continue
		}
		fileDesc, err := protodesc.NewFile(fd.AsFileDescriptorProto(), protoregistry.GlobalFiles)
		if err != nil {
			continue
		}
		_ = protoregistry.GlobalFiles.RegisterFile(fileDesc)
	}
}

func fullyQualifiedServiceName(fd *desc.FileDescriptor, svc *desc.ServiceDescriptor) string {
	if fd.GetPackage() == "" {
		return svc.GetName()
	}
	return fd.GetPackage() + "." + svc.GetName()
}

func executeStop(step testcase.Step, res *runner.StepResult) error {
	action, err := runner.DecodeAction[StopAction](step)
	if err != nil {
		return err
	}

	poolMu.Lock()
	entry, ok := pool[action.Addr]
	if ok {
		delete(pool, action.Addr)
	}
	poolMu.Unlock()

	if !ok {
		res.ResponseSummary = `{"status":"not_found"}`
		return nil
	}

	stopServer(entry.server)
	res.ResponseSummary = `{"status":"stopped"}`
	return nil
}

func stopExisting(addr string) {
	poolMu.Lock()
	entry, ok := pool[addr]
	if ok {
		delete(pool, addr)
	}
	poolMu.Unlock()

	if ok {
		stopServer(entry.server)
	}
}

func stopServer(server *grpc.Server) {
	done := make(chan struct{})
	go func() {
		server.GracefulStop()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		server.Stop()
		<-done
	}
}

// rawProtoMsg is a grpc codec-compatible wrapper for raw proto bytes.
type rawProtoMsg struct {
	b []byte
}

func (m *rawProtoMsg) ProtoMessage()            {}
func (m *rawProtoMsg) Reset()                   { m.b = nil }
func (m *rawProtoMsg) String() string           { return string(m.b) }
func (m *rawProtoMsg) Marshal() ([]byte, error) { return m.b, nil }
func (m *rawProtoMsg) Unmarshal(b []byte) error { m.b = b; return nil }
