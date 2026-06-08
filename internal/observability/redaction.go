package observability

import (
	"encoding/json"
	"strings"
)

// Truncate limits the length of a string.
func Truncate(s string, maxLen int) string {
	if len(s) > maxLen {
		return s[:maxLen] + "... [TRUNCATED]"
	}
	return s
}

// Redact JSON redacts sensitive fields from a JSON payload if they exist.
// This is a naive implementation for demonstration, it can be expanded.
func RedactJSON(rawPayload string) string {
	if rawPayload == "" {
		return ""
	}
	
	// Quick string check before parsing to save CPU
	sensitiveKeys := []string{"authorization", "token", "password", "secret"}
	needsRedaction := false
	lowerPayload := strings.ToLower(rawPayload)
	for _, key := range sensitiveKeys {
		if strings.Contains(lowerPayload, `"`+key+`"`) {
			needsRedaction = true
			break
		}
	}

	if !needsRedaction {
		return Truncate(rawPayload, 4096)
	}

	var data map[string]any
	if err := json.Unmarshal([]byte(rawPayload), &data); err != nil {
		// Cannot parse JSON, just truncate
		return Truncate(rawPayload, 4096)
	}

	redactMap(data)

	redactedBytes, _ := json.Marshal(data)
	return Truncate(string(redactedBytes), 4096)
}

func redactMap(m map[string]any) {
	for k, v := range m {
		lowerK := strings.ToLower(k)
		if lowerK == "authorization" || lowerK == "token" || lowerK == "password" || lowerK == "secret" {
			m[k] = "[REDACTED]"
			continue
		}
		
		// Recurse into maps
		if nestedMap, ok := v.(map[string]any); ok {
			redactMap(nestedMap)
		} else if nestedArray, ok := v.([]any); ok {
			for _, item := range nestedArray {
				if nm, ok := item.(map[string]any); ok {
					redactMap(nm)
				}
			}
		}
	}
}
