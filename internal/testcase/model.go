package testcase

import "encoding/json"

type TestCase struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Order       int    `json:"order"`
	Config      Config `json:"config"`
	Steps       []Step `json:"steps"`
	Category    string `json:"-"`
	SourcePath  string `json:"-"`
}

type Config struct {
	TimeoutMS int `json:"timeout_ms"`
}

type Step struct {
	StepID      string          `json:"step_id"`
	Type        string          `json:"type"`
	Description string          `json:"description"`
	Action      json.RawMessage `json:"action"`
	Assertions  []Assertion     `json:"asserts"`
	Exports     []Export        `json:"exports"`
}

type Assertion struct {
	Type   string `json:"type"`
	Path   string `json:"path,omitempty"`
	Expect any    `json:"expect"`
}

type Export struct {
	Path   string `json:"path"`
	Result string `json:"result,omitempty"`
	As     string `json:"as"`
}

type Summary struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Order       int    `json:"order"`
	Category    string `json:"category"`
	SourcePath  string `json:"source_path"`
}

func (tc TestCase) Summary() Summary {
	return Summary{
		ID:          tc.ID,
		Name:        tc.Name,
		Description: tc.Description,
		Order:       tc.Order,
		Category:    tc.Category,
		SourcePath:  tc.SourcePath,
	}
}
