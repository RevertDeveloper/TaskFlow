.DEFAULT_GOAL := help

COMPOSE_PROJECT_NAME ?= taskflow-dev
ENV_FILE ?= .env
COMPOSE := docker compose --project-name $(COMPOSE_PROJECT_NAME) --env-file $(ENV_FILE) -f compose.yaml -f compose.dev.yaml

.PHONY: help config ps logs up up-app up-web-api stop down restart build rebuild rebuild-no-cache pull clean-volumes migrate shell test

help:
	@printf '%s\n' \
		'Compose TaskFlow' \
		'  make up             Levanta todos los servicios y reconstruye si hace falta' \
		'  make up-app         Levanta web, api, worker y sus dependencias' \
		'  make up-web-api      Alias para levantar la aplicacion completa' \
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

ps:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs -f --tail=100

up:
	$(COMPOSE) up -d --build --remove-orphans

up-app:
	$(COMPOSE) up -d --build --remove-orphans web api worker

up-web-api: up-app

stop:
	$(COMPOSE) stop

down:
	$(COMPOSE) down --remove-orphans

restart:
	$(COMPOSE) restart

build:
	$(COMPOSE) build

rebuild:
	$(COMPOSE) up -d --build --force-recreate --remove-orphans

rebuild-no-cache:
	$(COMPOSE) build --no-cache
	$(COMPOSE) up -d --force-recreate --remove-orphans

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
