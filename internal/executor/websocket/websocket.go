package websocket

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"octoassert/internal/runner"
	"octoassert/internal/testcase"
	"octoassert/pkg/jsonpath"
)

// --- Action Models ---
type WSAction struct {
	URL        string            `json:"url"`
	Headers    map[string]string `json:"headers"`
	Operations []WSOperation     `json:"operations"`
}

type WSOperation struct {
	ID          string            `json:"id,omitempty"`
	Description string            `json:"description,omitempty"`
	Disabled    bool              `json:"disabled,omitempty"`
	Type        string            `json:"type"`              // "send" or "await"
	Payload     json.RawMessage   `json:"payload,omitempty"` // for send
	Match       AwaitMatch        `json:"match,omitempty"`   // for await
	TimeoutMs   int               `json:"timeout_ms,omitempty"`
	Exports     []testcase.Export `json:"exports,omitempty"`
}

type WSOperationLog struct {
	Index                  int               `json:"index"`
	ID                     string            `json:"id,omitempty"`
	Type                   string            `json:"type"`
	Description            string            `json:"description,omitempty"`
	Disabled               bool              `json:"disabled,omitempty"`
	Status                 string            `json:"status"`
	StartedAt              time.Time         `json:"started_at,omitempty"`
	FinishedAt             time.Time         `json:"finished_at,omitempty"`
	ElapsedMS              int64             `json:"elapsed_ms,omitempty"`
	SentAt                 time.Time         `json:"sent_at,omitempty"`
	Payload                any               `json:"payload,omitempty"`
	PayloadRaw             string            `json:"payload_raw,omitempty"`
	Match                  *AwaitMatch       `json:"match,omitempty"`
	TimeoutMs              int               `json:"timeout_ms,omitempty"`
	MatchedMessage         any               `json:"matched_message,omitempty"`
	MatchedMessageRaw      string            `json:"matched_message_raw,omitempty"`
	CollectedMessages      []any             `json:"collected_messages,omitempty"`
	CollectedMessagesRaw   []string          `json:"collected_messages_raw,omitempty"`
	CollectedMessagesCount int               `json:"collected_messages_count,omitempty"`
	Error                  string            `json:"error,omitempty"`
	Exports                []testcase.Export `json:"exports,omitempty"`
}

// AwaitMatch describes how to match an incoming WebSocket message.
// Exactly one of Equals / Any / Contains should be set.
type AwaitMatch struct {
	Path     string `json:"path"`               // gjson path to extract from the message
	Equals   any    `json:"equals,omitempty"`   // exact value match
	Any      bool   `json:"any,omitempty"`      // match as long as path exists
	Contains string `json:"contains,omitempty"` // path value contains this substring
}

// matchMessage returns true when msg satisfies the AwaitMatch criteria.
// If Path is empty, any message matches (useful for "wait for next message" without filtering).
func matchMessage(msg string, m AwaitMatch) bool {
	if m.Path == "" {
		return true
	}
	if m.Any {
		_, err := jsonpath.Extract(msg, m.Path)
		return err == nil
	}
	if m.Contains != "" {
		val, err := jsonpath.Extract(msg, m.Path)
		if err != nil {
			return false
		}
		return strings.Contains(fmt.Sprint(val), m.Contains)
	}
	ok, _ := jsonpath.Assert(msg, m.Path, m.Equals)
	return ok
}

type WSContext struct {
	conn     *websocket.Conn
	msgQueue []string
	mu       sync.Mutex
	cancel   context.CancelFunc
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

func (e *Executor) Execute(ctx context.Context, runCtx *runner.ExecutionContext, step testcase.Step) runner.StepResult {
	started := time.Now()
	res := runner.StepResult{
		StepID:      step.StepID,
		Description: step.Description,
		Type:        step.Type,
		StartedAt:   started,
		Status:      runner.StatusPassed,
	}

	if e.stepType != "websocket" {
		res.Status = runner.StatusFailed
		res.Error = fmt.Sprintf("unsupported websocket step type: %s", e.stepType)
		return res
	}

	action, err := runner.DecodeAction[WSAction](step)
	if err != nil {
		res.Status = runner.StatusFailed
		res.Error = err.Error()
		return res
	}

	headers := http.Header{}
	for k, v := range action.Headers {
		headers.Add(k, v)
	}

	conn, _, err := websocket.DefaultDialer.Dial(action.URL, headers)
	if err != nil {
		res.Status = runner.StatusFailed
		res.Error = fmt.Sprintf("dial failed: %v", err)
		return res
	}
	defer conn.Close() // GUARANTEED CLEANUP!

	readCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	wsc := &WSContext{
		conn:   conn,
		cancel: cancel,
	}

	// Start background reader
	go func() {
		for {
			select {
			case <-readCtx.Done():
				return
			default:
				_, msg, err := conn.ReadMessage()
				if err != nil {
					return
				}
				wsc.mu.Lock()
				wsc.msgQueue = append(wsc.msgQueue, string(msg))
				wsc.mu.Unlock()
			}
		}
	}()

	var allMessages []string
	var opLogs []WSOperationLog
	attachOperationLogs := func() {
		if len(opLogs) == 0 {
			return
		}
		raw, err := json.Marshal(map[string]any{"operation_logs": opLogs})
		if err == nil {
			res.RawPayload = raw
		}
	}

	// Process Operations sequentially
	for i, op := range action.Operations {
		opLog := WSOperationLog{
			Index:       i + 1,
			ID:          op.ID,
			Type:        op.Type,
			Description: op.Description,
			Disabled:    op.Disabled,
			StartedAt:   time.Now(),
			Match:       matchPtr(op.Match),
			TimeoutMs:   op.TimeoutMs,
			Exports:     op.Exports,
		}
		if op.Disabled {
			opLog.Status = "skipped"
			opLog.FinishedAt = time.Now()
			opLog.ElapsedMS = opLog.FinishedAt.Sub(opLog.StartedAt).Milliseconds()
			opLogs = append(opLogs, opLog)
			continue
		}
		switch op.Type {
		case "send":
			// Inject context mid-flight into payload
			payloadBytes := runner.InjectContext(op.Payload, runCtx)
			payloadBytes = orderJSONTypeFirst(payloadBytes)
			opLog.PayloadRaw = string(payloadBytes)
			opLog.Payload = parseJSONForLog(payloadBytes)
			if err := conn.WriteMessage(websocket.TextMessage, payloadBytes); err != nil {
				res.Status = runner.StatusFailed
				res.Error = fmt.Sprintf("op %d send failed: %v", i, err)
				opLog.Status = "failed"
				opLog.Error = res.Error
				opLog.FinishedAt = time.Now()
				opLog.ElapsedMS = opLog.FinishedAt.Sub(opLog.StartedAt).Milliseconds()
				opLogs = append(opLogs, opLog)
				attachOperationLogs()
				return res
			}
			opLog.Status = "sent"
			opLog.SentAt = time.Now()
			opLog.FinishedAt = opLog.SentAt
			opLog.ElapsedMS = opLog.FinishedAt.Sub(opLog.StartedAt).Milliseconds()
			opLogs = append(opLogs, opLog)

		case "await":
			timeout := time.Duration(op.TimeoutMs) * time.Millisecond
			if timeout == 0 {
				timeout = 5 * time.Second
			}
			waitCtx, waitCancel := context.WithTimeout(ctx, timeout)

			matchFound := false
			matchIdx := -1

		awaitLoop:
			for {
				select {
				case <-waitCtx.Done():
					waitCancel()
					res.Status = runner.StatusFailed
					res.Error = fmt.Sprintf("op %d await timeout", i)
					opLog.Status = "failed"
					opLog.Error = res.Error
					opLog.FinishedAt = time.Now()
					opLog.ElapsedMS = opLog.FinishedAt.Sub(opLog.StartedAt).Milliseconds()
					opLogs = append(opLogs, opLog)
					attachOperationLogs()
					return res
				case <-time.After(50 * time.Millisecond):
					wsc.mu.Lock()
					for idx, msg := range wsc.msgQueue {
						if matchMessage(msg, op.Match) {
							matchFound = true
							matchIdx = idx
							break
						}
					}
					wsc.mu.Unlock()

					if matchFound {
						break awaitLoop
					}
				}
			}
			waitCancel()

			wsc.mu.Lock()
			collectedMsgs := wsc.msgQueue[:matchIdx+1]
			wsc.msgQueue = wsc.msgQueue[matchIdx+1:] // consume matched messages
			wsc.mu.Unlock()

			allMessages = append(allMessages, collectedMsgs...)
			opLog.Status = "matched"
			opLog.CollectedMessages = rawMessagesForLog(collectedMsgs)
			opLog.CollectedMessagesRaw = collectedMsgs
			opLog.CollectedMessagesCount = len(collectedMsgs)
			if len(collectedMsgs) > 0 {
				matchedRaw := collectedMsgs[len(collectedMsgs)-1]
				opLog.MatchedMessageRaw = matchedRaw
				opLog.MatchedMessage = parseJSONForLog([]byte(matchedRaw))
			}

			// Process intermediate exports — extract from the MATCHED message directly.
			// The matched message is always the last element of collectedMsgs.
			if len(op.Exports) > 0 && len(collectedMsgs) > 0 {
				matchedMsg := collectedMsgs[len(collectedMsgs)-1]
				for _, exp := range op.Exports {
					val, err := jsonpath.Extract(matchedMsg, exp.Path)
					if err == nil {
						runCtx.Set(exp.As, val)
						if res.Values == nil {
							res.Values = make(map[string]any)
						}
						res.Values[exp.As] = val
					}
				}
			}
			opLog.FinishedAt = time.Now()
			opLog.ElapsedMS = opLog.FinishedAt.Sub(opLog.StartedAt).Milliseconds()
			opLogs = append(opLogs, opLog)
		case "collect":
			// Wait the full timeout then collect every message received in that window.
			timeout := time.Duration(op.TimeoutMs) * time.Millisecond
			if timeout == 0 {
				timeout = 3 * time.Second
			}
			collectCtx, collectCancel := context.WithTimeout(ctx, timeout)
			<-collectCtx.Done()
			collectCancel()

			wsc.mu.Lock()
			collectedMsgs := make([]string, len(wsc.msgQueue))
			copy(collectedMsgs, wsc.msgQueue)
			wsc.msgQueue = nil
			wsc.mu.Unlock()

			allMessages = append(allMessages, collectedMsgs...)
			opLog.Status = "collected"
			opLog.CollectedMessages = rawMessagesForLog(collectedMsgs)
			opLog.CollectedMessagesRaw = collectedMsgs
			opLog.CollectedMessagesCount = len(collectedMsgs)

			// Per-operation exports (extract from the array of all collected messages)
			if len(op.Exports) > 0 && len(collectedMsgs) > 0 {
				rawMsgs := make([]json.RawMessage, len(collectedMsgs))
				for mi, m := range collectedMsgs {
					rawMsgs[mi] = json.RawMessage(m)
				}
				collectedBytes, _ := json.Marshal(rawMsgs)
				collectedStr := string(collectedBytes)
				for _, exp := range op.Exports {
					val, err := jsonpath.Extract(collectedStr, exp.Path)
					if err == nil {
						runCtx.Set(exp.As, val)
						if res.Values == nil {
							res.Values = make(map[string]any)
						}
						res.Values[exp.As] = val
					}
				}
			}
			opLog.FinishedAt = time.Now()
			opLog.ElapsedMS = opLog.FinishedAt.Sub(opLog.StartedAt).Milliseconds()
			opLogs = append(opLogs, opLog)

		default:
			res.Status = runner.StatusFailed
			res.Error = fmt.Sprintf("unknown operation type: %s", op.Type)
			opLog.Status = "failed"
			opLog.Error = res.Error
			opLog.FinishedAt = time.Now()
			opLog.ElapsedMS = opLog.FinishedAt.Sub(opLog.StartedAt).Milliseconds()
			opLogs = append(opLogs, opLog)
			attachOperationLogs()
			return res
		}
	}

	// Final summary contains ALL messages received across all awaits
	if len(allMessages) > 0 {
		// Each message is already a JSON string; wrap as RawMessage so the
		// output is an array of objects instead of an array of escaped strings.
		raws := make([]json.RawMessage, 0, len(allMessages))
		for _, msg := range allMessages {
			raws = append(raws, json.RawMessage(msg))
		}
		out, _ := json.Marshal(raws)
		res.ResponseSummary = string(out)
	}

	res.FinishedAt = time.Now()
	res.ElapsedMS = res.FinishedAt.Sub(started).Milliseconds()
	attachOperationLogs()
	return res
}

func matchPtr(match AwaitMatch) *AwaitMatch {
	if match.Path == "" && match.Equals == nil && !match.Any && match.Contains == "" {
		return nil
	}
	return &match
}

func parseJSONForLog(raw []byte) any {
	var parsed any
	if err := json.Unmarshal(raw, &parsed); err == nil {
		return parsed
	}
	return string(raw)
}

func orderJSONTypeFirst(raw []byte) []byte {
	dec := json.NewDecoder(bytes.NewReader(raw))
	tok, err := dec.Token()
	if err != nil {
		return raw
	}
	delim, ok := tok.(json.Delim)
	if !ok || delim != '{' {
		return raw
	}

	type field struct {
		key   string
		value json.RawMessage
	}
	var fields []field
	for dec.More() {
		keyTok, err := dec.Token()
		if err != nil {
			return raw
		}
		key, ok := keyTok.(string)
		if !ok {
			return raw
		}
		var value json.RawMessage
		if err := dec.Decode(&value); err != nil {
			return raw
		}
		fields = append(fields, field{key: key, value: value})
	}
	if _, err := dec.Token(); err != nil {
		return raw
	}

	typeIdx := -1
	for i, f := range fields {
		if f.key == "Type" || f.key == "type" {
			typeIdx = i
			break
		}
	}
	if typeIdx <= 0 {
		return raw
	}

	ordered := make([]field, 0, len(fields))
	ordered = append(ordered, fields[typeIdx])
	ordered = append(ordered, fields[:typeIdx]...)
	ordered = append(ordered, fields[typeIdx+1:]...)

	var buf bytes.Buffer
	buf.WriteByte('{')
	for i, f := range ordered {
		if i > 0 {
			buf.WriteByte(',')
		}
		keyBytes, err := json.Marshal(f.key)
		if err != nil {
			return raw
		}
		buf.Write(keyBytes)
		buf.WriteByte(':')
		buf.Write(f.value)
	}
	buf.WriteByte('}')
	return buf.Bytes()
}

func rawMessagesForLog(messages []string) []any {
	raw := make([]any, 0, len(messages))
	for _, msg := range messages {
		raw = append(raw, parseJSONForLog([]byte(msg)))
	}
	return raw
}
