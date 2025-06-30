use anyhow::Result;
use futures::stream::SelectAll;
use futures::stream::SplitSink;
use futures_util::{SinkExt, StreamExt};
use log::*;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use sqlx::{SqlitePool, sqlite::SqlitePoolOptions};
use std::{collections::HashMap, env, net::SocketAddr, sync::Arc};
use tokio::{
    net::{TcpListener, TcpStream},
    sync::{
        Mutex,
        mpsc::{self, UnboundedSender},
    },
    task::JoinHandle,
};
use tokio_stream::wrappers::UnboundedReceiverStream;
use tokio_tungstenite::WebSocketStream;
use tokio_tungstenite::{accept_async, tungstenite::Message};

#[derive(Serialize, Deserialize, Debug)]
struct FirstData {
    pub command: String,
    pub canvas_id: String,
}

type CanvasClients = Arc<
    Mutex<
        HashMap<
            String,
            (
                JoinHandle<()>,
                UnboundedSender<(
                    mpsc::UnboundedReceiver<String>,
                    SplitSink<WebSocketStream<TcpStream>, Message>,
                )>,
            ),
        >,
    >,
>;

pub async fn create_websocket_server() -> JoinHandle<()> {
    let pool = SqlitePoolOptions::new()
        .connect(
            env::var("DATABASE_URL")
                .unwrap_or("sqlite://drawer.db".to_string())
                .as_str(),
        )
        .await
        .unwrap();
    let clients: CanvasClients = Arc::new(Mutex::new(HashMap::new()));
    let addr = "127.0.0.1:8001";
    let listener = TcpListener::bind(&addr).await.expect("Can't listen");
    info!("WebSocket listening on: {}", addr);
    tokio::spawn(async move {
        while let Ok((stream, _)) = listener.accept().await {
            let peer = stream
                .peer_addr()
                .expect("connected streams should have a peer address");
            info!("Peer address: {}", peer);
            let pool = pool.clone();
            let clients = clients.clone();
            tokio::spawn(handle_connection(peer, stream, clients, pool));
        }
    })
}

async fn handle_connection(
    peer: SocketAddr,
    stream: TcpStream,
    clients: CanvasClients,
    pool: SqlitePool,
) {
    if let Err(e) = handle_connection_impl(peer, stream, clients, pool).await {
        error!("Error processing connection: {}", e);
    }
}

async fn handle_connection_impl(
    peer: SocketAddr,
    stream: TcpStream,
    clients: CanvasClients,
    pool: SqlitePool,
) -> Result<()> {
    let ws_stream = accept_async(stream).await.expect("Failed to accept");
    info!("New WebSocket connection: {}", peer);
    let (mut ws_sender, mut ws_receiver) = ws_stream.split();
    // Receive first message (should be FirstData)
    let msg = ws_receiver
        .next()
        .await
        .ok_or(anyhow::anyhow!("No init message"))??;
    let first_data: FirstData = serde_json::from_str(msg.to_text()?)?;
    let canvas_id = first_data.canvas_id.clone();
    // Send event history
    let mut events_coll = vec![];
    let rows = sqlx::query("SELECT events FROM canvas_events WHERE canvas_id = $1")
        .bind(&canvas_id)
        .fetch_all(&pool)
        .await?;
    for row in rows {
        let events: String = row.try_get("events")?;
        events_coll.push(events);
    }
    ws_sender
        .send(Message::Text(
            serde_json::to_string(&events_coll).unwrap().into(),
        ))
        .await?;
    // Register sender for broadcast
    let (data_send, data_recv) = mpsc::unbounded_channel::<String>();
    clients
            .lock()
            .await
            .entry(first_data.canvas_id.clone())
            .or_insert_with(|| {
                info!("Creating new canvas handler for {}", first_data.canvas_id);
                let (send, mut recv) =
                    mpsc::unbounded_channel::<(mpsc::UnboundedReceiver<String>, SplitSink<WebSocketStream<TcpStream>, Message>)>();
                (
                    tokio::spawn(async move {
                        let mut select_all = SelectAll::new();
                        let mut sender_map = HashMap::<i32, SplitSink<WebSocketStream<TcpStream>, Message>>::new();
                        let mut next_id = 0;

                        loop {
                            tokio::select! {
                                Some(new_stream) = recv.recv() => {
                                    let id = next_id;
                                    next_id += 1;

                                    println!("Registered id {}", id);

                                    let stream = UnboundedReceiverStream::new(new_stream.0).map(move |msg| (msg, id));
                                    sender_map.insert(id, new_stream.1);
                                    select_all.push(stream);
                                }

                                Some((msg, from_id)) = select_all.next() => {
                                    let mut to_remove = Vec::new();
                                    for (&id, sender) in sender_map.iter_mut() {
                                        if id != from_id {
                                            match sender.send(Message::Text(msg.clone().into())).await {
                                                Ok(_) => {},
                                                // Err(wtransport::error::StreamWriteError::NotConnected) => {
                                                //     to_remove.push(id);
                                                // },
                                                Err(_) =>{
                                                    info!("Id {id} had and error");
                                                    to_remove.push(id);
                                                }
                                            }
                                        }
                                    }
                                    for id in to_remove {
                                        sender_map.remove(&id);
                                    }
                                }

                                else => break,
                            }
                        }
                    }),
                    send,
                )
            })
            .1
            .send((data_recv, ws_sender))
            .unwrap();
    while let Some(msg) = ws_receiver.next().await {
        let msg = match msg {
            Ok(Message::Text(text)) => text,
            Ok(_) => continue,
            Err(e) => {
                error!("WebSocket error: {}", e);
                break;
            }
        };
        let str_datas = msg.split('\n').filter(|s| !s.is_empty());

        for str_data in str_datas {
            let res = sqlx::query("INSERT INTO canvas_events (canvas_id, events) VALUES ($1, $2)")
                .bind(&first_data.canvas_id)
                .bind(str_data)
                .execute(&pool)
                .await;

            match res {
                Ok(_) => {}
                Err(e) => {
                    println!("Error {:?}", e);
                }
            }

            data_send.send(str_data.to_string()).unwrap();
        }
    }
    Ok(())
}
