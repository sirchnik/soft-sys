use anyhow::Result;
use futures::{SinkExt, StreamExt};
use log::*;
use sqlx::Row;
use sqlx::SqlitePool;
use tokio::{
    net::TcpStream,
    sync::{broadcast, mpsc},
};
use tokio_tungstenite::{WebSocketStream, tungstenite::Message};

use crate::shared::jwt::Claims;
use crate::wsocket_app::canvas_fwd::CanvasEvent;
use crate::wsocket_app::canvas_fwd::CanvasFwd;

pub async fn handle_canvas_connection(
    ws_stream: WebSocketStream<TcpStream>,
    jwt: Claims,
    client: CanvasFwd,
    pool: SqlitePool,
    rights_rx: broadcast::Receiver<crate::shared::CanvasDataEvent>,
) {
    if let Err(e) = handle_connection_impl(ws_stream, jwt, client, pool, rights_rx).await {
        error!("Error processing connection: {}", e);
    }
}

async fn handle_connection_impl(
    ws_stream: WebSocketStream<TcpStream>,
    jwt: Claims,
    client: CanvasFwd,
    pool: SqlitePool,
    rights_rx: broadcast::Receiver<crate::shared::CanvasDataEvent>,
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
    // Set initial value for watch receiver if needed
    // rights_tx.send((right.clone(), initial_moderated)).unwrap();

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
        .send((data_recv, ws_sender, canvas_id.clone()))
        .unwrap();

    let mut right = right;
    let mut moderated = initial_moderated;

    if ["M", "O"].contains(&right.as_str()) && first_cmd.event_type == "manage" {
        data_send.send(first_cmd).unwrap();
        return Ok(());
    }

    // Avoid moving canvas_id and pool by cloning inside the closure
    let handle_cmd = {
        let data_send = data_send.clone();
        let canvas_id = canvas_id.clone();
        let pool = pool.clone();
        move |event: CanvasEvent| {
            let data_send = data_send.clone();
            let canvas_id = canvas_id.clone();
            let pool = pool.clone();
            async move {
                let res =
                    sqlx::query("INSERT INTO canvas_events (canvas_id, events) VALUES ($1, $2)")
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
            }
        }
    };

    for msg in first_msg_split {
        handle_cmd(serde_json::from_str(msg).unwrap()).await;
    }

    let mut ws_receiver = ws_receiver.fuse();
    let mut rights_rx = rights_rx.resubscribe();
    loop {
        tokio::select! {
            biased;
            changed = rights_rx.recv() => {
                if let Ok(event) = changed {
                    match event {
                        crate::shared::CanvasDataEvent::RightChanged(ref cid, (ref uid, ref new_right)) if *cid == canvas_id && *uid == jwt.id => {
                            if let Some(new_right) = new_right {
                                right = new_right.clone();
                                // Send rights_changed event to client
                                data_send
                                    .send(CanvasEvent {
                                        event_type: "rights_changed".into(),
                                        canvas_id: canvas_id.clone(),
                                        timestamp: 0,
                                        payload: serde_json::json!({ "right": new_right }),
                                    })
                                    .unwrap();
                            } else {
                                // Send rights_changed event with null right
                                data_send
                                    .send(CanvasEvent {
                                        event_type: "rights_changed".into(),
                                        canvas_id: canvas_id.clone(),
                                        timestamp: 0,
                                        payload: serde_json::json!({ "right": null }),
                                    })
                                    .unwrap();
                                break;
                            }
                        },
                        crate::shared::CanvasDataEvent::ModeratedChanged(ref cid, new_moderated) if *cid == canvas_id => {
                            moderated = new_moderated;
                            // Send moderated_changed event to client
                            data_send
                                .send(CanvasEvent {
                                    event_type: "rights_changed".into(),
                                    canvas_id: canvas_id.clone(),
                                    timestamp: 0,
                                    payload: serde_json::json!({ "moderated": new_moderated }),
                                })
                                .unwrap();
                        },
                        _ => {}
                    }
                }
            }
            msg = ws_receiver.next() => {
                // Only check rights/moderation if more than 1min has passed
                let msg = match msg {
                    Some(Ok(Message::Text(text))) => text,
                    Some(Ok(_)) => continue,
                    Some(Err(e)) => {
                        error!("WebSocket error: {}", e);
                        break;
                    }
                    None => break,
                };
                let str_datas = msg.split('\n').filter(|s| !s.is_empty()).map(|s| {
                    let event: CanvasEvent = serde_json::from_str(s).unwrap();
                    event
                });
                for str_data in str_datas {
                    // Enforce moderation logic
                    if right == "W" && moderated {
                        // Writer, but canvas is moderated: block
                        continue;
                    }
                    // V, M, O can always write
                    handle_cmd(str_data).await;
                }
            }
        }
    }
    return Ok(());
}
