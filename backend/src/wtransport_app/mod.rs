use anyhow::Result;
use futures::stream::SelectAll;
use serde::{Deserialize, Serialize};
use std::{cmp::Reverse, collections::HashMap, env, sync::Arc, time::Duration};
use tokio::{
    sync::{
        Mutex,
        mpsc::{self, UnboundedReceiver, UnboundedSender},
    },
    task::JoinHandle,
};
use tracing::info;
use wtransport::{
    Endpoint, Identity, RecvStream, SendStream, ServerConfig, endpoint::IncomingSession,
};

type WTransportStreams =
    Arc<Mutex<HashMap<String, (JoinHandle<()>, UnboundedSender<(SendStream, RecvStream)>)>>>;

#[derive(Serialize, Deserialize)]
struct FirstData {
    pub command: String,
    pub canvas_id: String,
}

pub async fn create_wtransport(_shared_state: Arc<crate::AppState>) -> tokio::task::JoinHandle<()> {
    let identity = Identity::load_pemfiles(
        &env::var("CERT_PATH").unwrap_or_else(|_| "../cert.pem".to_string()),
        &env::var("KEY_PATH").unwrap_or_else(|_| "../key.pem".to_string()),
    )
    .await
    .unwrap();
    let config = ServerConfig::builder()
        .with_bind_default(4433)
        .with_identity(identity)
        .keep_alive_interval(Some(Duration::from_secs(5)))
        .build();
    let canvas_streams: WTransportStreams = Arc::new(Mutex::new(HashMap::new()));
    tracing::debug!("WebTransport listening on port 4433");
    let webtransport_handle = tokio::spawn(async move {
        let server = Endpoint::server(config).unwrap();
        for _id in 0.. {
            let incoming_session = server.accept().await;
            tokio::spawn(handle_incoming_session(
                incoming_session,
                canvas_streams.clone(),
            ));
        }
    });
    return webtransport_handle;
}

async fn handle_incoming_session(
    incoming_session: IncomingSession,
    canvas_streams: WTransportStreams,
) {
    async fn handle_incoming_session_impl(
        incoming_session: IncomingSession,
        canvas_streams: WTransportStreams,
    ) -> Result<()> {
        info!("Waiting for session request...");
        let session_request = incoming_session.await?;
        info!(
            "New session: Authority: '{}', Path: '{}'",
            session_request.authority(),
            session_request.path()
        );
        let connection = session_request.accept().await?;
        info!("Waiting for data from client...");

        // Shared list of senders to broadcast to all streams
        loop {
            let conn = connection.clone();
            let mut stream = conn.accept_bi().await.unwrap();
            let mut buf = vec![0; 65536];
            let bytes_read = match stream.1.read(&mut buf).await? {
                Some(bytes_read) => bytes_read,
                None => continue,
            };
            let first_data: FirstData = serde_json::from_slice(&buf[..bytes_read]).unwrap();
        }
    }

    let result = handle_incoming_session_impl(incoming_session, canvas_streams).await;
    info!("Result: {:?}", result);
}

// canvas_streams
//     .lock()
//     .await
//     .entry(first_data.canvas_id.clone())
//     .or_insert_with(|| {
//         let (mut send, mut recv) =
//             mpsc::unbounded_channel::<(SendStream, RecvStream)>();
//         (
//             tokio::spawn(async move {
//                 let mut select_all = SelectAll::new();
//                 let mut sender_map = HashMap::<i32, SendStream>::new();
//                 let mut next_id = 0;

//                 loop {
//                     tokio::select! {
//                         Some(new_stream) = recv.recv() => {
//                             let id = next_id;
//                             next_id += 1;

//                             select_all.push(stream);

//                             // You can also store a sender for each stream if you want to write back to them
//                             let (tx, _rx) = mpsc::unbounded_channel::<String>();
//                             sender_map.insert(id, tx);
//                         }

//                         Some((from_id, msg)) = select_all.next() => {
//                             // Broadcast the message to all other streams
//                             for (&id, sender) in sender_map.iter() {
//                                 if id != from_id {
//                                     let _ = sender.send(msg.clone());
//                                 }
//                             }
//                         }

//                         else => break,
//                     }
//                 }
//             }),
//             send,
//         )
//     })
//     .1
//     .send((stream.0, stream.1))
//     .unwrap();
