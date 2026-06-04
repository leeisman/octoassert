package store

import (
	"sync"

	"octoassert/internal/runner"
)

var _ Store = (*Memory)(nil) // compile-time interface check

type Memory struct {
	mux  sync.RWMutex
	runs []runner.RunResult
}

func NewMemory() *Memory {
	return &Memory{}
}

func (s *Memory) Save(run runner.RunResult) {
	s.mux.Lock()
	defer s.mux.Unlock()
	s.runs = append([]runner.RunResult{run}, s.runs...)
}

func (s *Memory) List() []runner.RunResult {
	s.mux.RLock()
	defer s.mux.RUnlock()
	out := make([]runner.RunResult, len(s.runs))
	copy(out, s.runs)
	return out
}
