# Architecture Documentation

## 1. Overview

This project is a collaborative drawing application with:

- User authentication and authorization
- Real-time multiuser canvas editing
- Rights management for canvas access and moderation

It consists of four main components: an HTTP backend, a WebSocket server, a
TypeScript SPA frontend, and a SQLite database.

---

## 2. Components

### 2.1 HTTP Backend (Rust + Axum)

**Responsibilities**

- Serve static frontend assets (HTML, JS, CSS)
- Provide REST endpoints for:

  - Authentication
  - Canvas management

- Broadcast rights changes to connected clients

**Dependencies**

- `axum` — HTTP server and request handling
- `serde_json` — JSON serialization/deserialization
- `jsonwebtoken` — JWT authentication (algorithm support, validation)
- `argon2` — Password hashing

**Authentication**

- A JWT is issued upon successful login.
- Stored in a secure, HTTP-only cookie
- Payload contents:
  - id — User ID
  - email — User email address
  - display_name — User display name
  - (exp — Expiration timestamp)
- The JWT only holds user information no other state.

---

### 2.2 WebSocket Server (Rust + Tungstenite)

**Responsibilities**

- Broadcast canvas updates to all connected clients
- Enforce user rights on canvas actions
- Process rights changes in real-time

**Dependencies**

- `tungstenite` — WebSocket handling (security and standards compliance)
- `tokio-stream`, `anyhow`, `futures` — Async programming utilities

**WebSocket Interaction**

- **Authentication**: The server expects the client to present a valid JWT via
  cookie in the WebSocket upgrade request.
- **Message Types**:
  - `PING`: Keepalive check + memory cleaner for long-dead connections. The
    server echoes the event back to the sender.
  - `DRAW_EVENT`: Drawing actions (e.g., strokes, erases) are sent by clients
    and broadcast to all other clients on the same canvas.
  - `RIGHTS_CHANGED`: Sent by the server when a user's rights on a canvas
    change. If a user loses all rights, the server notifies and closes their
    connection.
- **Event Forwarding**:
  - Events are only forwarded to clients connected to the same canvas, except
    for the sender (who does not receive their own event).
  - If a client connection fails, it is removed from the forwarding map.
- **Rights Enforcement**:
  - The server checks user rights before processing drawing or moderation
    actions.

---

### 2.3 Frontend (TypeScript SPA)

**Responsibilities**

- Single-page application with routes:

  - `/`
  - `/login`
  - `/register`
  - `/canvas/<ID>`

- User authentication (login/register forms, JWT cookie handling)
- Personalized home page with accessible canvas list
- Canvas creation UI
- Real-time drawing and updates via WebSocket

**Dependencies**

- `esbuild` — Bundling and building frontend code
- `live-server` — Local development server

---

### 2.4 Database (SQLite)

**Schema**

- **`users`** — Stores user data:

  - `id`, `email`, `display_name`, `password_hash`
  - Creation/update timestamps

- **`canvas`** — Stores canvas metadata:

  - `id`, `moderated` flag

- **`canvas_events`** — Stores serialized drawing events per canvas (linked by
  `canvas_id`) for persistence/replay

- **`user_canvas`** — Associates users with canvases and rights:

  - Rights: `R`, `W`, `V`, `M`, `O`
  - Referential integrity with cascading deletes

**Migrations**

- Managed with `sqlx migrate`
- `migrate.sh` applies pending migrations
- New migrations go in `migrations/` with descriptive filenames
- Documentation:
  [SQLx Migrations](https://docs.rs/sqlx/latest/sqlx/macro.migrate.html)

**Dependencies**

- `sqlx` — Database access (runtime-checked SQL, Postgres-ready)

---

## 3. Rights System

| Code  | Permission Level  | Description                               |
| ----- | ----------------- | ----------------------------------------- |
| **R** | Read-only         | View canvas, see in list                  |
| **W** | Write             | Edit canvas if not moderated              |
| **V** | Write (moderated) | Edit even if moderated                    |
| **M** | Moderator         | Edit, toggle moderation, assign up to `V` |
| **O** | Owner             | Full control, assign any rights           |

## 3. Development Setup

### Dependencies

- Rust toolchain (latest stable)
- Node > 23
- pnpm > 10

### Commands

- `cargo run` — Start the backend server
- `npm run dev` — Start the frontend development server (hot reload)

## 4. Deployment

Docker is used for deployment. Start like this:

```bash
docker compose up -d --build
```

In the future there will be reverse proxy (e.g., Traefik) required to handle SSL
termination and routing

## 5. Limitations and Future Work

1. Horizontal scaling does not work as (not part of the Aufgabenstellung)
   - The REST API needs to talk to the websocket server.
   - Each Canvas would need its own WebSocket server instance but one Server
     would need to direct the connections to the correct instance.
2. JWT need a way to be invalidated (e.g., logout).
3. Security needs to be improved (e.g., CSRF protection).
