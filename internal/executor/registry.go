package executor

import (
	"octoassert/internal/executor/dbcheck"
	"octoassert/internal/executor/delay"
	"octoassert/internal/executor/fakegrpcserver"
	"octoassert/internal/executor/fakehttpserver"
	"octoassert/internal/executor/group"
	"octoassert/internal/executor/grpcunary"
	"octoassert/internal/executor/httpreq"
	"octoassert/internal/executor/include"
	"octoassert/internal/executor/websocket"
	"octoassert/internal/runner"
)

func NewRegistry() *runner.Registry {
	registry := runner.NewRegistry()
	registry.Register(delay.New())
	registry.Register(grpcunary.New())
	registry.Register(httpreq.New())
	registry.Register(dbcheck.New())
	registry.Register(include.New(registry))
	registry.Register(group.New(registry))
	registry.Register(websocket.New("websocket"))
	registry.Register(fakehttpserver.New("fake_http_start"))
	registry.Register(fakehttpserver.New("fake_http_stop"))
	registry.Register(fakegrpcserver.New("fake_grpc_start"))
	registry.Register(fakegrpcserver.New("fake_grpc_stop"))
	return registry
}
