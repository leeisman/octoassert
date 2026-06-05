package websocket

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"octoassert/internal/runner"
	"octoassert/internal/testcase"
	"octoassert/pkg/jsonpath"
)

// --- Global Connection Pool ---
type WSContext struct {
	conn     *websocket.Conn
	msgQueue []string
	mu       sync.Mutex
	cancel   context.CancelFunc
}

var (
	poolMu   sync.RWMutex
	connPool = make(map[string]*WSContext)
)

// --- Action Models ---
type ConnectAction struct {
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers"`
}

type SendAction struct {
	ConnID  string          `json:"conn_id"`
	Payload json.RawMessage `json:"payload"`
}

type AwaitMatch struct {
	Path   string `json:"path"`
	Equals any    `json:"equals"`
}

type AwaitAction struct {
	ConnID    string     `json:"conn_id"`
	Match     AwaitMatch `json:"match"`
	TimeoutMs int        `json:"timeout_ms"`
}

type CloseAction struct {
	ConnID string `json:"conn_id"`
}

// --- Executor ---
type Executor struct {
	stepType string
}

func New(stepType string) *Executor {
	return &Executor{stepType: stepType}
}

func (e *Executor) Type() string {
	return e.stepType
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

	var err error

	switch e.stepType {
	case "websocket_connect":
		err = e.executeConnect(ctx, step, &res)
	case "websocket_send":
		err = e.executeSend(step, &res)
	case "websocket_await":
		err = e.executeAwait(step, &res)
	case "websocket_close":
		err = e.executeClose(step, &res)
	default:
		err = fmt.Errorf("unknown websocket step type: %s", e.stepType)
	}

	if err != nil {
		res.Status = runner.StatusFailed
		res.Error = err.Error()
	}

	res.FinishedAt = time.Now()
	res.ElapsedMS = res.FinishedAt.Sub(started).Milliseconds()
	return res
}

func (e *Executor) executeConnect(ctx context.Context, step testcase.Step, res *runner.StepResult) error {
	action, err := runner.DecodeAction[ConnectAction](step)
	if err != nil {
		return err
	}

	headers := http.Header{}
	for k, v := range action.Headers {
		headers.Add(k, v)
	}

	conn, _, err := websocket.DefaultDialer.Dial(action.URL, headers)
	if err != nil {
		return fmt.Errorf("dial failed: %w", err)
	}

	// Generate a unique conn_id
	connID := fmt.Sprintf("ws-%d", time.Now().UnixNano())

	readCtx, cancel := context.WithCancel(context.Background())
	wsc := &WSContext{
		conn:   conn,
		cancel: cancel,
	}

	poolMu.Lock()
	connPool[connID] = wsc
	poolMu.Unlock()

	// Start background reader
	go func() {
		for {
			select {
			case <-readCtx.Done():
				return
			default:
				_, msg, err := conn.ReadMessage()
				if err != nil {
					// Connection closed or error
					return
				}
				wsc.mu.Lock()
				wsc.msgQueue = append(wsc.msgQueue, string(msg))
				wsc.mu.Unlock()
			}
		}
	}()

	// Inject conn_id into response summary so Runner's Export can extract it
	res.ResponseSummary = fmt.Sprintf(`{"conn_id":"%s"}`, connID)
	return nil
}

func (e *Executor) executeSend(step testcase.Step, res *runner.StepResult) error {
	action, err := runner.DecodeAction[SendAction](step)
	if err != nil {
		return err
	}
	res.RawPayload = action.Payload

	poolMu.RLock()
	wsc, ok := connPool[action.ConnID]
	poolMu.RUnlock()

	if !ok {
		return fmt.Errorf("connection not found: %s", action.ConnID)
	}

	err = wsc.conn.WriteMessage(websocket.TextMessage, action.Payload)
	if err != nil {
		return fmt.Errorf("write message failed: %w", err)
	}
	res.ResponseSummary = `{"status":"sent"}`
	return nil
}

func (e *Executor) executeAwait(step testcase.Step, res *runner.StepResult) error {
	action, err := runner.DecodeAction[AwaitAction](step)
	if err != nil {
		return err
	}

	poolMu.RLock()
	wsc, ok := connPool[action.ConnID]
	poolMu.RUnlock()

	if !ok {
		return fmt.Errorf("connection not found: %s", action.ConnID)
	}

	timeout := time.Duration(action.TimeoutMs) * time.Millisecond
	if timeout == 0 {
		timeout = 5 * time.Second // default timeout
	}

	deadline := time.Now().Add(timeout)
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()

	for {
		if time.Now().After(deadline) {
			return fmt.Errorf("timeout waiting for message matching path '%s'", action.Match.Path)
		}

		<-ticker.C

		wsc.mu.Lock()
		matchIdx := -1
		var matchedMsg string

		// Scan from oldest to newest
		for i, msg := range wsc.msgQueue {
			ok, _ := jsonpath.Assert(msg, action.Match.Path, action.Match.Equals)
			if ok {
				matchIdx = i
				matchedMsg = msg
				break
			}
		}

		if matchIdx != -1 {
			// Found it! Discard this message and all older messages
			wsc.msgQueue = wsc.msgQueue[matchIdx+1:]
			wsc.mu.Unlock()
			
			res.ResponseSummary = matchedMsg
			return nil
		}
		wsc.mu.Unlock()
	}
}

func (e *Executor) executeClose(step testcase.Step, res *runner.StepResult) error {
	action, err := runner.DecodeAction[CloseAction](step)
	if err != nil {
		return err
	}

	poolMu.Lock()
	wsc, ok := connPool[action.ConnID]
	if ok {
		delete(connPool, action.ConnID)
	}
	poolMu.Unlock()

	if !ok {
		return fmt.Errorf("connection not found: %s", action.ConnID)
	}

	wsc.cancel() // Stop reader goroutine
	wsc.conn.Close()
	res.ResponseSummary = `{"status":"closed"}`
	return nil
}
