use anyhow::Result;
use futures::stream::{SelectAll, SplitSink};
use futures::{SinkExt, StreamExt};
use log::*;
use serde::Deserialize;
use sqlx::Row;
use sqlx::SqlitePool;
use std::collections::HashMap;
use tokio::{net::TcpStream, sync::mpsc};
use tokio_stream::wrappers::UnboundedReceiverStream;
use tokio_tungstenite::{WebSocketStream, tungstenite::Message};

use crate::{shared::jwt::Claims, wsocket_app::wsocket::CanvasClients};

#[derive(Deserialize)]
struct FirstData {
    pub command: String,
    pub canvas_id: String,
}

pub async fn handle_canvas_connection(
    ws_stream: WebSocketStream<TcpStream>,
    jwt: Claims,
    clients: CanvasClients,
    pool: SqlitePool,
) {
    if let Err(e) = handle_connection_impl(ws_stream, jwt, clients, pool).await {
        error!("Error processing connection: {}", e);
    }
}

async fn handle_connection_impl(
    ws_stream: WebSocketStream<TcpStream>,
    jwt: Claims,
    clients: CanvasClients,
    pool: SqlitePool,
) -> Result<()> {
    let (mut ws_sender, mut ws_receiver) = ws_stream.split();
    // Receive first message (should be FirstData)
    let msg = ws_receiver
        .next()
        .await
        .ok_or(anyhow::anyhow!("No init message"))??;
    let first_data: FirstData = serde_json::from_str(msg.to_text()?)?;
    let canvas_id = first_data.canvas_id.clone();
    info!("User {} connected to canvas {}", jwt.email, canvas_id);
    // Send event history
    let mut events_coll = vec![];
    let right = sqlx::query("SELECT right FROM user_canvas WHERE canvas_id = $1 AND user_id = $2")
        .bind(&canvas_id)
        .bind(&jwt.id)
        .fetch_all(&pool)
        .await?;
    if right.is_empty() {
        ws_sender
            .send(Message::Text(
                "{\"error\": \"You do not have access to this canvas.\"}".into(),
            ))
            .await?;
        return Ok(());
    }
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
    let right: String = right[0].try_get("right").unwrap();
    if right == "R" {
        return Ok(());
    }

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
