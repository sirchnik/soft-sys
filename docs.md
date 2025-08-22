# Architecture Documentation

> [!NOTE]
>
> This document is intentionally short and only covers the most important parts
> of the architecture.
>
> Additionally writing it was not part of the original Aufgabenstellung.

---

## 1. Overview

This project is a collaborative drawing application. It supports:

- user authentication and authorization
- real-time multi-user canvas editing
- rights management for canvas access and moderation

The system consists of four main components: an HTTP backend, a WebSocket
server, a TypeScript SPA frontend, and a SQLite database.

---

## 2. Components

### 2.1 HTTP Backend (Rust + Axum)

The backend serves static frontend assets (HTML, JS, CSS) and provides REST
endpoints for authentication and canvas management. It also broadcasts rights
changes to connected clients.

Dependencies:

- axum for HTTP server and routing
- serde_json for JSON serialization
- jsonwebtoken for JWT authentication
- argon2 for password hashing

Authentication:

A JWT is issued upon successful login and stored in a secure, HTTP-only cookie.
The token payload contains

- user id
- email
- display name
- expiration timestamp.

JWTs only carry identity information, no other state as this data is not
changing constantly and changes are expected by user actions to only be visible
after relogin.

---

### 2.2 WebSocket Server (Rust + Tungstenite)

The WebSocket server handles real-time collaboration. It broadcasts canvas
updates, enforces rights on canvas actions, and applies rights changes in real
time.

Dependencies:

- tungstenite for WebSocket handling
- tokio-stream, futures, anyhow for async utilities

Protocol details:

- Authentication: the client presents a valid JWT (via cookie) during the
  upgrade request.
- Message types:

  - `PING`: keepalive, echoed back
  - `DRAW_EVENT`: drawing actions, broadcast to all other clients on the same
    canvas
  - `RIGHTS_CHANGED`: sent by the server when a user’s rights change;
    connections are closed if rights are revoked

- Events are forwarded only to other clients on the same canvas, never to the
  sender. Dead connections are removed.
- All drawing and moderation actions are validated against the user’s rights.

---

### 2.3 Frontend (TypeScript SPA)

The frontend is a single-page application with routes for `/`, `/login`,
`/register`, and `/canvas/<ID>`.

It provides login and registration forms with JWT cookie handling, a
personalized home page with a list of canvases, canvas creation, and real-time
drawing via WebSocket.

Dependencies:

- esbuild for bundling
- live-server for local development

---

### 2.4 Database (SQLite)

Schema:

- `users`: stores user accounts (id, email, display_name, password_hash,
  timestamps)
- `canvas`: stores canvas metadata (id, moderated flag)
- `canvas_events`: serialized drawing events per canvas, linked via canvas_id
- `user_canvas`: user–canvas associations with rights (R, W, V, M, O);
  referential integrity enforced with cascading deletes

Migrations:

- managed with `sqlx migrate`
- applied via `migrate.sh`
- new migrations live in `migrations/` with descriptive filenames
- see [SQLx Migrations](https://docs.rs/sqlx/latest/sqlx/macro.migrate.html)

Dependencies:

- sqlx for database access (runtime-checked SQL, Postgres-ready)

---

## 3. Implementation Details

### 3.1 Canvas Event Sourcing

The system uses event sourcing for canvas state. Each interaction produces an
event that is:

1. applied locally in the frontend,
2. broadcast to other clients,
3. persisted in the database.

On canvas load, all stored events are replayed in chronological order.

### 3.2 User Rights

| Code | Permission level  | Description                             |
| ---- | ----------------- | --------------------------------------- |
| R    | Read-only         | View canvas, see in list                |
| W    | Write             | Edit canvas if not moderated            |
| V    | Write (moderated) | Edit even if moderated                  |
| M    | Moderator         | Edit, toggle moderation, assign up to V |
| O    | Owner             | Full control, assign any rights         |

Right changes are done in REST-API and broadcast to all websocket clients using
rust channels.

### 3.3 Frontend Routing

Each page is defined by a function that updates a `pageContent` element and
returns a cleanup function that runs on navigation.

---

## 4. Development Setup

Dependencies:

- Rust toolchain (latest stable)
- Node.js ≥ 23
- pnpm ≥ 10

Commands:

- `cargo run` — start the backend server
- `npm run dev` — start the frontend dev server with hot reload

---

## 5. Deployment

Deployment is handled via Docker. Start with:

```bash
docker compose up -d --build
```

In the future, a reverse proxy such as Traefik will be required for SSL
termination and routing.

---

## 6. Limitations and Future Work

1. Horizontal scaling is not supported as each canvas would need its own
   WebSocket instance with a router in front.
2. Vertical scaling is not implemented. Canvas event forwarders could be
   separated into their own Rust tasks.
3. Event logs grow indefinitely. They should be compacted by periodically
   replacing histories with snapshots of the visible state.
4. JWTs cannot be invalidated (logout not possible).
5. Security is incomplete (e.g. CSRF protection is missing), though this was
   outside the Aufgabenstellung.
