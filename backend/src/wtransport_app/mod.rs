use anyhow::Result;
use std::{env, sync::Arc, time::Duration};
use tracing::info;
use wtransport::{Endpoint, Identity, ServerConfig, endpoint::IncomingSession};

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
    tracing::debug!("WebTransport listening on port 4433");
    let webtransport_handle = tokio::spawn(async move {
        let server = Endpoint::server(config).unwrap();
        for _id in 0.. {
            let incoming_session = server.accept().await;

            tokio::spawn(handle_incoming_session(incoming_session));
        }
    });
    return webtransport_handle;
}

async fn handle_incoming_session(incoming_session: IncomingSession) {
    async fn handle_incoming_session_impl(incoming_session: IncomingSession) -> Result<()> {
        let mut buffer = vec![0; 65536].into_boxed_slice();

        info!("Waiting for session request...");

        let session_request = incoming_session.await?;

        info!(
            "New session: Authority: '{}', Path: '{}'",
            session_request.authority(),
            session_request.path()
        );

        let connection = session_request.accept().await?;

        info!("Waiting for data from client...");

        loop {
            tokio::select! {
                stream = connection.accept_bi() => {
                    let mut stream = stream?;
                    info!("Accepted BI stream");

                    let bytes_read = match stream.1.read(&mut buffer).await? {
                        Some(bytes_read) => bytes_read,
                        None => continue,
                    };

                    let str_data = std::str::from_utf8(&buffer[..bytes_read])?;
                    let mut buffer = vec![0; 65536].into_boxed_slice();
                    info!("Received (bi) '{str_data}' from client");

                    let bytes_read = match stream.1.read(&mut buffer).await? {
                        Some(bytes_read) => bytes_read,
                        None => continue,
                    };
                    // todo new thread
                    let str_data = std::str::from_utf8(&buffer[..bytes_read])?;

                    info!("Received (bi) '{str_data}' from client");
                }
                stream = connection.accept_uni() => {
                    let mut stream = stream?;
                    info!("Accepted UNI stream");

                    let bytes_read = match stream.read(&mut buffer).await? {
                        Some(bytes_read) => bytes_read,
                        None => continue,
                    };

                    let str_data = std::str::from_utf8(&buffer[..bytes_read])?;

                    info!("Received (uni) '{str_data}' from client");

                    let mut stream = connection.open_uni().await?.await?;
                    stream.write_all(b"ACK").await?;
                }
                dgram = connection.receive_datagram() => {
                    let dgram = dgram?;
                    let str_data = std::str::from_utf8(&dgram)?;

                    info!("Received (dgram) '{str_data}' from client");

                    connection.send_datagram(b"ACK")?;
                }
            }
        }
    }

    let result = handle_incoming_session_impl(incoming_session).await;
    info!("Result: {:?}", result);
}
