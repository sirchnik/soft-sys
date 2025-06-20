use anyhow::Result;
use futures::StreamExt;
use futures::stream::SelectAll;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use sqlx::{SqlitePool, sqlite::SqlitePoolOptions};
use std::{collections::HashMap, env, sync::Arc, time::Duration};
use tokio::{
    sync::{
        Mutex,
        mpsc::{self, UnboundedSender},
    },
    task::JoinHandle,
};
use tokio_stream::wrappers::UnboundedReceiverStream;
use tracing::info;
use wtransport::{Endpoint, Identity, SendStream, ServerConfig, endpoint::IncomingSession};

type WTransportStreams = Arc<
    Mutex<
        HashMap<
            String,
            (
                JoinHandle<()>,
                UnboundedSender<(mpsc::UnboundedReceiver<String>, SendStream)>,
            ),
        >,
    >,
>;

#[derive(Serialize, Deserialize)]
struct FirstData {
    pub command: String,
    pub canvas_id: String,
}

pub async fn create_wtransport() -> tokio::task::JoinHandle<()> {
    let pool = SqlitePoolOptions::new()
        .connect(
            env::var("DATABASE_URL")
                .unwrap_or("sqlite://drawer.db".to_string())
                .as_str(),
        )
        .await
        .unwrap();

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
                pool.clone(),
            ));
        }
    });
    return webtransport_handle;
}

async fn handle_incoming_session(
    incoming_session: IncomingSession,
    canvas_streams: WTransportStreams,
    pool: SqlitePool,
) {
    async fn handle_incoming_session_impl(
        incoming_session: IncomingSession,
        canvas_streams: WTransportStreams,
        pool: SqlitePool,
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
        let mut stream = connection.accept_bi().await.unwrap();
        let mut buf = vec![0; 65536];
        let bytes_read = match stream.1.read(&mut buf).await? {
            Some(bytes_read) => bytes_read,
            None => return Err(anyhow::anyhow!("Stream closed before reading data")),
        };
        let first_data: FirstData = serde_json::from_slice(&buf[..bytes_read])?;
        let mut events_coll = vec![];
        let rows = sqlx::query("SELECT events FROM canvas_events WHERE canvas_id = $1")
            .bind(&first_data.canvas_id)
            .fetch_all(&pool)
            .await
            .unwrap(); // 500 if fail
        for row in rows {
            let events: String = row.try_get("events").unwrap();
            events_coll.push(events)
        }
        stream
            .0
            .write(serde_json::to_string(&events_coll)?.as_bytes())
            .await?;
        let (data_send, data_recv) = mpsc::unbounded_channel::<String>();
        canvas_streams
            .lock()
            .await
            .entry(first_data.canvas_id.clone())
            .or_insert_with(|| {
                info!("Creating new canvas handler for {}", first_data.canvas_id);
                let (send, mut recv) =
                    mpsc::unbounded_channel::<(mpsc::UnboundedReceiver<String>, SendStream)>();
                (
                    tokio::spawn(async move {
                        let mut select_all = SelectAll::new();
                        let mut sender_map = HashMap::<i32, SendStream>::new();
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
                                    println!("{}", msg);
                                    let mut to_remove = Vec::new();
                                    for (&id, sender) in sender_map.iter_mut() {
                                        if id != from_id {
                                            match sender.write(msg.as_bytes()).await {
                                                Ok(_) => {},
                                                Err(wtransport::error::StreamWriteError::NotConnected) => {
                                                    to_remove.push(id);
                                                },
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
            .send((data_recv, stream.0))
            .unwrap();
        loop {
            let bytes_read = match stream.1.read(&mut buf).await? {
                Some(bytes_read) => bytes_read,
                None => break, // Stream closed
            };
            if bytes_read == 0 {
                break; // No more data
            }
            info!("Received {} bytes from client", bytes_read);
            let str_data = std::str::from_utf8(&buf[..bytes_read])?;

            println!("{}", first_data.canvas_id);
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

            data_send.send(String::from(str_data)).unwrap();
            // Here you can process the received data as needed
        }
        Ok(())
    }

    let result = handle_incoming_session_impl(incoming_session, canvas_streams, pool).await;
    info!("Result: {:?}", result);
}
