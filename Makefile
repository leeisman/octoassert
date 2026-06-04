.PHONY: serve serve-mem build test

# 啟動（預設用 SQLite 持久化到 data/runs.db）
serve:
	@mkdir -p data
	GOCACHE=/private/tmp/game_service_console_go_cache go run . server console --db data/runs.db

# 啟動（in-memory，重啟後清空）
serve-mem:
	GOCACHE=/private/tmp/game_service_console_go_cache go run . server console

# 編譯 binary
build:
	go build -trimpath -o ./app .

test:
	GOCACHE=/private/tmp/game_service_console_go_cache go test ./...
