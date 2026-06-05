package runner

import (
	"encoding/json"
	"testing"
)

func TestInjectContextPreservesNumericPlaceholderType(t *testing.T) {
	runCtx := NewExecutionContext()
	runCtx.Set("ctx.roomid", 4)

	got := InjectContext([]byte(`{"Type":"subscribe","Room":"${ctx.roomid}"}`), runCtx)

	var payload map[string]any
	if err := json.Unmarshal(got, &payload); err != nil {
		t.Fatalf("unmarshal injected payload: %v", err)
	}
	if room, ok := payload["Room"].(float64); !ok || room != 4 {
		t.Fatalf("Room = %#v, want numeric 4", payload["Room"])
	}
}

func TestInjectContextToleratesDoubleCtxPrefix(t *testing.T) {
	runCtx := NewExecutionContext()
	runCtx.Set("ctx.roomid", 4)

	got := InjectContext([]byte(`{"Type":"subscribe","Room":"${ctx.ctx.roomid}"}`), runCtx)

	var payload map[string]any
	if err := json.Unmarshal(got, &payload); err != nil {
		t.Fatalf("unmarshal injected payload: %v", err)
	}
	if room, ok := payload["Room"].(float64); !ok || room != 4 {
		t.Fatalf("Room = %#v, want numeric 4", payload["Room"])
	}
}
