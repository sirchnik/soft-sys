FROM node:23-alpine AS base-frontend
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY ./frontend /app
WORKDIR /app

FROM base-frontend AS frontend-build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
ARG BACKEND_URL=http://localhost:8000
ARG BACKEND_WS_URL=http://localhost:8001
ENV BACKEND_URL=$BACKEND_URL
ENV BACKEND_WS_URL=$BACKEND_WS_URL
RUN pnpm run build

FROM rust:1.87-alpine AS backend-build

COPY backend /app
WORKDIR /app

RUN apk add --no-cache musl-dev openssl-dev libgcc sqlx

RUN ./migrate.sh

RUN cargo build --release

FROM alpine:latest AS final

RUN apk add --no-cache musl-dev openssl-dev libgcc

RUN addgroup -S app && adduser -S app -G app
USER app
WORKDIR /app

COPY --from=frontend-build --chown=app:app /app/dist/ /app/frontend/dist/
COPY --from=frontend-build --chown=app:app /app/static/ /app/frontend/static/
COPY --from=frontend-build --chown=app:app /app/index.html /app/frontend/
COPY --from=backend-build --chown=app:app /app/target/release/backend /app/backend
COPY --from=backend-build --chown=app:app /app/drawer.db /app/drawer.db

EXPOSE 8000
CMD ["./backend"]
