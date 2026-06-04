package store

import "octoassert/internal/runner"

type Store interface {
	Save(run runner.RunResult)
	List() []runner.RunResult
}
