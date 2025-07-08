use log::*;
use sqlx::{SqlitePool, sqlite::SqlitePoolOptions};
use std::env;
use tokio::{
    net::{TcpListener, TcpStream},
    task::JoinHandle,
};
use tokio_tungstenite::{
    accept_hdr_async,
    tungstenite::handshake::server::{Request, Response},
};

use crate::{
    shared::jwt::Claims,
    wsocket_app::{canvas_fwd::create_client, canvas_ws::handle_canvas_connection},
};
use crate::{shared::jwt::parse_jwt_from_cookies, wsocket_app::canvas_fwd::CanvasFwd};

pub async fn create_websocket_server(
    ws_receiver: tokio::sync::broadcast::Receiver<bool>,
) -> JoinHandle<()> {
    let pool = SqlitePoolOptions::new()
        .connect(
            env::var("DATABASE_URL")
                .unwrap_or("sqlite://drawer.db".to_string())
                .as_str(),
        )
        .await
        .unwrap();
    let clients: CanvasFwd = create_client();
    let addr = "127.0.0.1:8001";
    let listener = TcpListener::bind(&addr).await.expect("Can't listen");
    info!("WebSocket listening on: {}", addr);
    tokio::spawn(async move {
        while let Ok((stream, _)) = listener.accept().await {
            let pool = pool.clone();
            let clients = clients.clone();
            let receiver = ws_receiver.resubscribe();
            tokio::spawn(async move {
                accept_connection(stream, clients, pool, receiver).await;
            });
        }
    })
}

async fn accept_connection(
    stream: TcpStream,
    client: CanvasFwd,
    pool: SqlitePool,
    ws_receiver: tokio::sync::broadcast::Receiver<bool>,
) {
    let mut jwt_outer: Option<Claims> = None;
    let callback = |req: &Request, response: Response| {
        let cookies = match req.headers().get("cookie").and_then(|c| c.to_str().ok()) {
            Some(cookies) => cookies,
            None => return Err(Response::builder().status(401).body(None).unwrap()),
        };
        if let Ok(jwt) = parse_jwt_from_cookies(cookies) {
            jwt_outer = Some(jwt.claims);
        } else {
            return Err(Response::builder().status(401).body(None).unwrap());
        }

        Ok(response)
    };
    let ws_stream = accept_hdr_async(stream, callback)
        .await
        .expect("Error during the websocket handshake occurred");

    handle_canvas_connection(ws_stream, jwt_outer.unwrap(), client, pool, ws_receiver).await;
}
