FROM node:24-bookworm-slim AS nodebin

FROM python:3.12-slim-bookworm

COPY --from=nodebin /usr/local/bin/node /usr/local/bin/node

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /workspace

COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt \
    && node --version

COPY backend /workspace/backend

WORKDIR /workspace/backend

EXPOSE 5000

# --debug turns on the stat reloader. It polls mtimes, so a save on the
# bind-mounted source restarts the process inside this container.
CMD ["flask", "--app", "wsgi", "run", "--debug", "--host", "0.0.0.0", "--port", "5000"]
