.PHONY: check lint typecheck test test-e2e up down migrate seed generate dev

# 质量门禁（宪法 VIII）：lint + typecheck + 单元/集成测试全绿
check: lint typecheck test

lint:
	pnpm lint

typecheck:
	pnpm typecheck

test:
	pnpm test

test-e2e:
	pnpm test:e2e

up:
	docker compose -f docker/docker-compose.dev.yml up -d

down:
	docker compose -f docker/docker-compose.dev.yml down

generate:
	pnpm db:generate

migrate:
	pnpm db:migrate

seed:
	pnpm db:seed

dev:
	pnpm dev
