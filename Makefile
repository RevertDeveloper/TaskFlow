.DEFAULT_GOAL := help

TASKFLOW_ROOT := $(patsubst %/,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))

COMPOSE_PROJECT_NAME ?= taskflow-dev
DEV_ENV_FILE ?= $(TASKFLOW_ROOT)/.env.dev
DEV_ENV_ARGS := --env-file $(if $(wildcard $(DEV_ENV_FILE)),$(DEV_ENV_FILE),/dev/null)
COMPOSE := docker compose --project-name $(COMPOSE_PROJECT_NAME) $(DEV_ENV_ARGS) -f $(TASKFLOW_ROOT)/compose.yaml -f $(TASKFLOW_ROOT)/compose.dev.yaml
TASKFLOW_DEV_HOST_PORTS := 10730 10731 10740 10750
PRODUCTION_COMPOSE_PROJECT_NAME ?= taskflow-production
PRODUCTION_ENV_FILE ?= $(if $(strip $(TASKFLOW_ENV_FILE)),$(TASKFLOW_ENV_FILE),$(TASKFLOW_ROOT)/.env)
# Production currently uses these legacy names; changing them requires data migration.
PRODUCTION_POSTGRES_VOLUME_NAME ?= taskflow-dev_postgres_data
PRODUCTION_REDIS_VOLUME_NAME ?= taskflow-dev_redis_data
PRODUCTION_AUDIO_VOLUME_NAME ?= taskflow-production_audio
PRODUCTION_BUILD_FLAGS ?=
PRODUCTION_COMPOSE = TASKFLOW_POSTGRES_VOLUME_NAME="$(PRODUCTION_POSTGRES_VOLUME_NAME)" \
	TASKFLOW_REDIS_VOLUME_NAME="$(PRODUCTION_REDIS_VOLUME_NAME)" \
	TASKFLOW_AUDIO_VOLUME_NAME="$(PRODUCTION_AUDIO_VOLUME_NAME)" \
	docker compose --project-name $(PRODUCTION_COMPOSE_PROJECT_NAME) --env-file "$(PRODUCTION_ENV_FILE)" -f $(TASKFLOW_ROOT)/compose.production.yaml

.PHONY: help check-dev-ports check-production-env check-production-ports \
	dev-config production-config dev-ps production-ps dev-logs production-logs \
	dev-up dev-up-app dev-stop dev-down dev-restart dev-build dev-rebuild \
	dev-rebuild-no-cache dev-pull dev-clean-volumes dev-migrate dev-shell dev-test \
	production-build production-migrate production-smoke rebuild rebuild-no-cache \
	rebuild-production build-production up-public config check-ports ps logs up \
	up-app up-web-api stop down restart build pull clean-volumes migrate shell test

help:
	@printf '%s\n' \
		'TaskFlow: comandos de producción y desarrollo separados' \
		'' \
		'PRODUCCIÓN (uso habitual):' \
		'  make rebuild              Construye, migra, despliega y verifica producción' \
		'  make rebuild-no-cache     Igual, reconstruyendo imágenes sin caché' \
		'  make production-config    Valida la configuración productiva' \
		'  make production-ps        Muestra estado de producción' \
		'  make production-logs      Sigue logs de producción' \
		'  make production-migrate   Ejecuta checks y migraciones sin recrear la app' \
		'' \
		'DESARROLLO (uso de agentes):' \
		'  make dev-up               Levanta la stack local completa' \
		'  make dev-rebuild          Reconstruye y recrea solo desarrollo' \
		'  make dev-down             Detiene y elimina contenedores, conserva volúmenes' \
		'  make dev-clean-volumes    Borra volúmenes locales de desarrollo' \
		'  make dev-config           Valida Compose de desarrollo' \
		'  make dev-ps / dev-logs    Estado y logs de desarrollo' \
		'  make dev-migrate / dev-test / dev-shell' \
		'' \
		'Producción usa $(TASKFLOW_ROOT)/.env por defecto.' \
		'Para otro archivo seguro: TASKFLOW_ENV_FILE=/ruta/.env.production make rebuild.' \
		'Dev usa .env.dev, puertos loopback 10730-10750 y volúmenes taskflow-development_*.' \
		'Producción conserva los volúmenes de datos actuales; no los renombres sin migrar.' \
		'Aliases legacy: make up/up-app/up-web-api/down/stop = dev; make up-public = prod.'

check-production-env:
	@if ! test -f "$(PRODUCTION_ENV_FILE)"; then \
		printf 'No existe el entorno de producción: %s\n' "$(PRODUCTION_ENV_FILE)" >&2; \
		printf 'Crea %s o configura TASKFLOW_ENV_FILE=/ruta/segura/.env.production y vuelve a ejecutar make rebuild.\n' "$(TASKFLOW_ROOT)/.env" >&2; \
		exit 2; \
	fi
	@if test "$$(stat -c '%a' "$(PRODUCTION_ENV_FILE)")" != "600"; then \
		printf 'El entorno productivo debe tener permisos 600: %s\n' "$(PRODUCTION_ENV_FILE)" >&2; \
		printf 'Ejecuta: chmod 600 "%s"\n' "$(PRODUCTION_ENV_FILE)" >&2; \
		exit 2; \
	fi

check-dev-ports:
	@for port in $(TASKFLOW_DEV_HOST_PORTS); do \
		owners=$$(docker ps --filter "publish=$$port" --format '{{.Names}} {{.Label "com.docker.compose.project"}}'); \
		foreign=$$(printf '%s\n' "$$owners" | awk '$$2 != "$(COMPOSE_PROJECT_NAME)" && NF'); \
		if test -n "$$foreign"; then \
			printf 'Puerto dev %s ocupado por otra stack:\n%s\n' "$$port" "$$foreign" >&2; \
			exit 1; \
		fi; \
	done

check-production-ports: check-production-env
	@set -a; . "$(PRODUCTION_ENV_FILE)"; set +a; \
	for port in "$${WEB_PORT:-10700}" "$${API_PORT:-10701}"; do \
		owners=$$(docker ps --filter "publish=$$port" --format '{{.Names}} {{.Label "com.docker.compose.project"}}'); \
		foreign=$$(printf '%s\n' "$$owners" | awk '$$2 != "$(PRODUCTION_COMPOSE_PROJECT_NAME)" && NF'); \
		if test -n "$$foreign"; then \
			printf 'Puerto prod %s ocupado por otra stack:\n%s\n' "$$port" "$$foreign" >&2; \
			exit 1; \
		fi; \
	done

dev-config:
	$(COMPOSE) config --quiet

production-config: check-production-env
	$(PRODUCTION_COMPOSE) config --quiet

dev-ps:
	$(COMPOSE) ps

production-ps: check-production-env
	$(PRODUCTION_COMPOSE) ps

dev-logs:
	$(COMPOSE) logs -f --tail=100

production-logs: check-production-env
	$(PRODUCTION_COMPOSE) logs -f --tail=100

dev-up: check-dev-ports
	$(COMPOSE) up -d --build --remove-orphans --wait --wait-timeout 60

dev-up-app: check-dev-ports
	$(COMPOSE) up -d --build --remove-orphans --wait --wait-timeout 60 web api worker

dev-stop:
	$(COMPOSE) stop

dev-down:
	$(COMPOSE) down --remove-orphans

dev-restart:
	$(COMPOSE) restart

dev-build:
	$(COMPOSE) build

dev-rebuild: check-dev-ports
	$(COMPOSE) up -d --build --force-recreate --remove-orphans --wait --wait-timeout 60

dev-rebuild-no-cache: check-dev-ports
	$(COMPOSE) build --no-cache
	$(COMPOSE) up -d --force-recreate --remove-orphans --wait --wait-timeout 60

dev-pull:
	$(COMPOSE) pull

dev-clean-volumes:
	$(COMPOSE) down --volumes --remove-orphans

dev-migrate:
	$(COMPOSE) run --rm api python manage.py migrate

dev-shell:
	$(COMPOSE) run --rm api python manage.py shell

dev-test:
	$(COMPOSE) run --rm api pytest

production-build: production-config
	$(PRODUCTION_COMPOSE) build $(PRODUCTION_BUILD_FLAGS) web api worker

production-migrate: check-production-env
	$(PRODUCTION_COMPOSE) config --quiet
	$(PRODUCTION_COMPOSE) up -d --no-recreate --wait --wait-timeout 120 db redis
	$(PRODUCTION_COMPOSE) run --rm --no-deps api python manage.py check --deploy
	$(PRODUCTION_COMPOSE) run --rm --no-deps api python manage.py migrate --noinput
	$(PRODUCTION_COMPOSE) run --rm --no-deps api python manage.py collectstatic --noinput

production-smoke: check-production-env
	@set -a; . "$(PRODUCTION_ENV_FILE)"; set +a; "$(TASKFLOW_ROOT)/infra/scripts/smoke.sh"

rebuild: check-production-ports
	$(PRODUCTION_COMPOSE) config --quiet
	$(PRODUCTION_COMPOSE) build $(PRODUCTION_BUILD_FLAGS) web api worker
	$(PRODUCTION_COMPOSE) up -d --no-recreate --wait --wait-timeout 120 db redis
	$(PRODUCTION_COMPOSE) run --rm --no-deps api python manage.py check --deploy
	$(PRODUCTION_COMPOSE) run --rm --no-deps api python manage.py migrate --noinput
	$(PRODUCTION_COMPOSE) run --rm --no-deps api python manage.py collectstatic --noinput
	$(PRODUCTION_COMPOSE) up -d --no-deps --force-recreate --wait --wait-timeout 120 web api worker
	$(PRODUCTION_COMPOSE) ps
	@set -a; . "$(PRODUCTION_ENV_FILE)"; set +a; "$(TASKFLOW_ROOT)/infra/scripts/smoke.sh"

rebuild-no-cache: PRODUCTION_BUILD_FLAGS := --no-cache
rebuild-no-cache: rebuild

rebuild-production: rebuild
build-production: production-build
up-public: rebuild

check-ports: check-dev-ports
config: dev-config
ps: dev-ps
logs: dev-logs
up: dev-up
up-app: dev-up-app
up-web-api: dev-up-app
stop: dev-stop
down: dev-down
restart: dev-restart
build: dev-build
pull: dev-pull
clean-volumes: dev-clean-volumes
migrate: dev-migrate
shell: dev-shell
test: dev-test
