package websocket

import "testing"

func TestOrderJSONTypeFirst(t *testing.T) {
	got := string(orderJSONTypeFirst([]byte(`{"Room":4,"Type":"subscribe","Payload":{"P":0}}`)))
	want := `{"Type":"subscribe","Room":4,"Payload":{"P":0}}`
	if got != want {
		t.Fatalf("orderJSONTypeFirst() = %s, want %s", got, want)
	}
}

func TestOrderJSONTypeFirstKeepsLowercaseTypeFirst(t *testing.T) {
	got := string(orderJSONTypeFirst([]byte(`{"room":4,"type":"subscribe"}`)))
	want := `{"type":"subscribe","room":4}`
	if got != want {
		t.Fatalf("orderJSONTypeFirst() = %s, want %s", got, want)
	}
}
