use anyhow::Result;
use futures::stream::{SelectAll, SplitSink};
use futures::{SinkExt, StreamExt};
use log::*;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::sync::mpsc::UnboundedSender;
use tokio::task::JoinHandle;
use tokio::{net::TcpStream, sync::mpsc};
use tokio_stream::wrappers::UnboundedReceiverStream;
use tokio_tungstenite::{WebSocketStream, tungstenite::Message};

use crate::shared::jwt::Claims;

#[derive(Deserialize, Serialize)]
pub struct CanvasEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub canvas_id: String,
    timestamp: u64,
    pub payload: serde_json::Value,
}
pub type CanvasClient = Arc<
    Mutex<(
        JoinHandle<()>,
        UnboundedSender<(
            mpsc::UnboundedReceiver<CanvasEvent>,
            SplitSink<WebSocketStream<TcpStream>, Message>,
            String, // canvas_id
            bool,   // initial moderated state
        )>,
    )>,
>;

pub fn create_client() -> CanvasClient {
    // this should have been multiple forwarders per canvas but thread handling was too complicated
    let (send, mut recv) = mpsc::unbounded_channel::<(
        mpsc::UnboundedReceiver<CanvasEvent>,
        SplitSink<WebSocketStream<TcpStream>, Message>,
        String, // canvas_id
        bool,   // initial moderated state
    )>();
    let fwd_register_task = tokio::spawn(async move {
        let mut select_all = SelectAll::new();
        // Change: canvas_sender_map is now HashMap<String, HashMap<i32, SplitSink<...>>>
        let mut canvas_sender_map: HashMap<
            String,
            HashMap<i32, SplitSink<WebSocketStream<TcpStream>, Message>>,
        > = HashMap::new();
        let mut id_canvas_map: HashMap<i32, String> = HashMap::new();
        let mut next_id = 0;

        loop {
            tokio::select! {
                Some(new_stream) = recv.recv() => {
                    let id = next_id;
                    next_id += 1;
                    let canvas_id = new_stream.2.clone();
                    println!("Registered id {} for canvas {}", id, canvas_id);
                    let stream = UnboundedReceiverStream::new(new_stream.0).map(move |msg| (msg, id));
                    canvas_sender_map.entry(canvas_id.clone()).or_default().insert(id, new_stream.1);
                    id_canvas_map.insert(id, canvas_id);
                    select_all.push(stream);
                }

                Some((event, from_id)) = select_all.next() => {
                    let mut to_remove = Vec::new();
                    // Only forward to clients on the same canvas, except the sender
                    if let Some(canvas_id) = id_canvas_map.get(&from_id) {
                        if let Some(sender_map) = canvas_sender_map.get_mut(canvas_id) {
                            for (&id, sender) in sender_map.iter_mut() {
                                if id != from_id {
                                    match sender
                                        .send(Message::Text(serde_json::to_string(&event).unwrap().into()))
                                        .await
                                    {
                                        Ok(_) => {}
                                        Err(_) => {
                                            info!("Id {id} had an error");
                                            to_remove.push((canvas_id.clone(), id));
                                        }
                                    }
                                }
                            }
                        }
                    }
                    for (canvas_id, id) in to_remove {
                        if let Some(sender_map) = canvas_sender_map.get_mut(&canvas_id) {
                            sender_map.remove(&id);
                            if sender_map.is_empty() {
                                canvas_sender_map.remove(&canvas_id);
                            }
                        }
                        id_canvas_map.remove(&id);
                    }
                }

                else => break,
            }
        }
    });

    return Arc::new(Mutex::new((fwd_register_task, send)));
}

pub async fn handle_canvas_connection(
    ws_stream: WebSocketStream<TcpStream>,
    jwt: Claims,
    client: CanvasClient,
    pool: SqlitePool,
) {
    if let Err(e) = handle_connection_impl(ws_stream, jwt, client, pool).await {
        error!("Error processing connection: {}", e);
    }
}

async fn handle_connection_impl(
    ws_stream: WebSocketStream<TcpStream>,
    jwt: Claims,
    client: CanvasClient,
    pool: SqlitePool,
) -> Result<()> {
    let (mut ws_sender, mut ws_receiver) = ws_stream.split();
    // Receive first message (should be FirstData)
    let msg = ws_receiver
        .next()
        .await
        .ok_or(anyhow::anyhow!("No init message"))??;
    let mut first_msg_split = msg.to_text()?.split("\n");
    let first_cmd = first_msg_split.next().unwrap();
    let first_cmd: CanvasEvent = serde_json::from_str(first_cmd)?;
    let canvas_id = first_cmd.canvas_id.clone();
    let canvas_data = sqlx::query(
        "SELECT right, moderated FROM user_canvas uc JOIN canvas c ON uc.canvas_id = c.id WHERE uc.canvas_id = ? AND user_id = ?",
    )
    .bind(&canvas_id)
    .bind(&jwt.id)
    .fetch_one(&pool)
    .await?;

    if canvas_data.is_empty() {
        ws_sender
            .send(Message::Text(
                "{\"error\": \"You do not have access to this canvas.\"}".into(),
            ))
            .await?;
        return Ok(());
    }

    let right: String = canvas_data.try_get("right")?;
    let initial_moderated: bool = canvas_data.try_get("moderated")?;

    if first_cmd.event_type == "register" && first_cmd.payload.as_bool() == Some(true) {
        info!("User {} connected to canvas {}", jwt.email, canvas_id);
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
    }

    let (data_send, data_recv) = mpsc::unbounded_channel::<CanvasEvent>();

    // Register sender for broadcast
    client
        .lock()
        .await
        .1
        .send((data_recv, ws_sender, canvas_id.clone(), initial_moderated))
        .unwrap();

    if ["M", "O"].contains(&right.as_str()) && first_cmd.event_type == "manage" {
        data_send.send(first_cmd).unwrap();
        return Ok(());
    }

    if right == "R" {
        return Ok(());
    }

    let handle_cmd = async move |event: CanvasEvent| {
        let res = sqlx::query("INSERT INTO canvas_events (canvas_id, events) VALUES ($1, $2)")
            .bind(&canvas_id)
            .bind(serde_json::to_string(&event).unwrap())
            .execute(&pool)
            .await;

        match res {
            Ok(_) => {}
            Err(e) => {
                println!("Error {:?}", e);
            }
        }

        data_send.send(event).unwrap();
    };

    for msg in first_msg_split {
        handle_cmd(serde_json::from_str(msg).unwrap()).await;
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
        let str_datas = msg.split('\n').filter(|s| !s.is_empty()).map(|s| {
            let event: CanvasEvent = serde_json::from_str(s).unwrap();
            event
        });

        for str_data in str_datas {
            handle_cmd(str_data).await;
        }
    }
    return Ok(());
}
