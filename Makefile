.DEFAULT_GOAL := help

COMPOSE_PROJECT_NAME ?= taskflow-dev
ENV_FILE ?= .env
COMPOSE := docker compose --project-name $(COMPOSE_PROJECT_NAME) --env-file $(ENV_FILE) -f compose.yaml -f compose.dev.yaml
TASKFLOW_HOST_PORTS := 10700 10701 10710 10720
PRODUCTION_COMPOSE_PROJECT_NAME ?= taskflow-production
PRODUCTION_COMPOSE := docker compose --project-name $(PRODUCTION_COMPOSE_PROJECT_NAME) --env-file $(ENV_FILE) -f compose.production.yaml

.PHONY: help config check-ports ps logs up up-app up-web-api up-public stop down restart build rebuild rebuild-no-cache pull clean-volumes migrate shell test

help:
	@printf '%s\n' \
		'Compose TaskFlow' \
		'  make up             Levanta todos los servicios y reconstruye si hace falta' \
		'  make up-app         Levanta web, api, worker y sus dependencias' \
		'  make up-public      Cambia la instancia pública a la composición productiva' \
		'  make up-web-api      Alias para levantar la aplicacion completa' \
		'  make check-ports     Comprueba conflictos de puertos antes de arrancar' \
		'  make stop            Detiene los contenedores sin eliminarlos' \
		'  make down            Detiene y elimina contenedores/redes, conserva volumenes' \
		'  make restart         Reinicia todos los servicios' \
		'  make build           Construye las imagenes' \
		'  make rebuild         Construye y recrea los servicios' \
		'  make rebuild-no-cache Construye sin cache y recrea los servicios' \
		'  make ps              Muestra estado y salud' \
		'  make logs            Sigue los logs de todos los servicios' \
		'  make config          Valida la configuracion final de Compose' \
		'  make pull            Descarga las imagenes externas' \
		'  make migrate         Ejecuta las migraciones de Django' \
		'  make shell           Abre un shell de Django' \
		'  make test            Ejecuta las pruebas del API'

config:
	$(COMPOSE) config --quiet

check-ports:
	@for port in $(TASKFLOW_HOST_PORTS); do \
		owners=$$(docker ps --filter "publish=$$port" --format '{{.Names}} {{.Label "com.docker.compose.project"}}'); \
		foreign=$$(printf '%s\n' "$$owners" | awk '$$2 != "$(COMPOSE_PROJECT_NAME)" && NF'); \
		if test -n "$$foreign"; then \
			printf 'Puerto %s ocupado por otra stack:\n%s\n' "$$port" "$$foreign" >&2; \
			exit 1; \
		fi; \
	done

ps:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs -f --tail=100

up:
	$(MAKE) check-ports
	$(COMPOSE) up -d --build --remove-orphans --wait --wait-timeout 60

up-app:
	$(MAKE) check-ports
	$(COMPOSE) up -d --build --remove-orphans --wait --wait-timeout 60 web api worker

up-web-api: up-app

up-public:
	$(COMPOSE) down --remove-orphans
	TASKFLOW_POSTGRES_VOLUME_NAME=$(COMPOSE_PROJECT_NAME)_postgres_data \
	TASKFLOW_REDIS_VOLUME_NAME=$(COMPOSE_PROJECT_NAME)_redis_data \
	TASKFLOW_AUDIO_VOLUME_NAME=$(PRODUCTION_COMPOSE_PROJECT_NAME)_audio \
	$(PRODUCTION_COMPOSE) up -d --build --remove-orphans --wait --wait-timeout 120

stop:
	$(COMPOSE) stop

down:
	$(COMPOSE) down --remove-orphans

restart:
	$(COMPOSE) restart

build:
	$(COMPOSE) build

rebuild:
	$(MAKE) check-ports
	$(COMPOSE) up -d --build --force-recreate --remove-orphans --wait --wait-timeout 60

rebuild-no-cache:
	$(MAKE) check-ports
	$(COMPOSE) build --no-cache
	$(COMPOSE) up -d --force-recreate --remove-orphans --wait --wait-timeout 60

pull:
	$(COMPOSE) pull

clean-volumes:
	$(COMPOSE) down --volumes --remove-orphans

migrate:
	$(COMPOSE) run --rm api python manage.py migrate

shell:
	$(COMPOSE) run --rm api python manage.py shell

test:
	$(COMPOSE) run --rm api pytest
