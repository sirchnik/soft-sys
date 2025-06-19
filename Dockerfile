FROM alpine:latest AS cert

WORKDIR /certs

COPY ./gen-self-signed-cert.sh ./gen-self-signed-cert.sh

RUN apk add --no-cache openssl
RUN ./gen-self-signed-cert.sh

FROM node:23-alpine AS base-frontend
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY ./frontend /app
COPY --from=cert /certs/cert.pem /app/cert.pem
WORKDIR /app

FROM base-frontend AS frontend-build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
# A non-self-signed cert does not need to be present for the build
ARG BACKEND_URL=http://localhost:8000
ENV BACKEND_URL=$BACKEND_URL
ARG SELF_SIGNED=false
RUN if [ "$SELF_SIGNED" = "true" ]; then CERT_PATH=cert.pem pnpm run build; else pnpm run build; fi

FROM rust:1.87-alpine AS backend-build

COPY backend /app
WORKDIR /app

RUN apk add --no-cache musl-dev openssl-dev libgcc sqlx

RUN sqlx migrate run --database-url=sqlite://drawer.db

RUN cargo build --release

FROM alpine:latest AS final

RUN apk add --no-cache musl-dev openssl-dev libgcc

RUN addgroup -S app && adduser -S app -G app
USER app
WORKDIR /app

COPY --from=frontend-build --chown=app:app /app/dist /app/frontend/
COPY --from=frontend-build --chown=app:app /app/static /app/frontend/
COPY --from=frontend-build --chown=app:app /app/index.html /app/frontend/
COPY --from=backend-build --chown=app:app /app/target/release/backend /app/backend
# provide your own certs via volumes
COPY --from=cert /certs/cert.pem /app/cert.pem
COPY --from=cert /certs/key.pem /app/key.pem

EXPOSE 8000
CMD ["./backend"]
