FROM python:3.12-slim-bookworm AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

FROM base AS runtime-dependencies

COPY apps/api/requirements.txt /tmp/requirements.txt
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt

FROM runtime-dependencies AS development-dependencies

COPY apps/api/requirements-dev.txt /tmp/requirements-dev.txt
RUN /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements-dev.txt

FROM base AS runtime

RUN groupadd --system taskflow \
    && useradd --system --gid taskflow --home-dir /app --shell /usr/sbin/nologin taskflow

COPY --from=runtime-dependencies /opt/venv /opt/venv
COPY --chown=taskflow:taskflow apps/api ./
RUN mkdir -p /app/staticfiles /app/var/audio \
    && chown -R taskflow:taskflow /app/staticfiles /app/var

USER taskflow

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
    CMD python -c "import urllib.request; request = urllib.request.Request('http://127.0.0.1:8000/api/ready', headers={'X-Forwarded-Proto': 'https'}); urllib.request.urlopen(request, timeout=3)"

CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--access-logfile", "-", "--error-logfile", "-"]

FROM runtime AS development

USER root
COPY --from=development-dependencies /opt/venv /opt/venv
USER taskflow