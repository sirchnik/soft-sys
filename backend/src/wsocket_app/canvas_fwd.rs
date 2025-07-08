use futures::stream::{SelectAll, SplitSink};
use futures::{SinkExt, StreamExt};
use log::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::sync::mpsc::UnboundedSender;
use tokio::task::JoinHandle;
use tokio::{net::TcpStream, sync::mpsc};
use tokio_stream::wrappers::UnboundedReceiverStream;
use tokio_tungstenite::{WebSocketStream, tungstenite::Message};

#[derive(Deserialize, Serialize)]
pub struct CanvasEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub canvas_id: String,
    pub timestamp: u64,
    pub payload: serde_json::Value,
}
pub type CanvasClient = Arc<
    Mutex<(
        JoinHandle<()>,
        UnboundedSender<(
            mpsc::UnboundedReceiver<CanvasEvent>,
            SplitSink<WebSocketStream<TcpStream>, Message>,
            String, // canvas_id
        )>,
    )>,
>;

pub fn create_client() -> CanvasClient {
    // this should have been multiple forwarders per canvas but thread handling was too complicated
    let (send, mut recv) = mpsc::unbounded_channel::<(
        mpsc::UnboundedReceiver<CanvasEvent>,
        SplitSink<WebSocketStream<TcpStream>, Message>,
        String, // canvas_id
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
