package testcase

// GroupFile 是 group 檔案的頂層結構，只包含 steps，不是完整的 TestCase。
type GroupFile struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Steps       []Step `json:"steps"`
}
