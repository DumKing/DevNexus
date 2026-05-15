use std::io::{BufRead, BufReader, Write};
use std::net::{SocketAddr, TcpListener, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const PROTOCOL: &str = "devnexus-lan-chat";
const DEFAULT_PORT: u16 = 45881;
const PUBLIC_ROOM_ID: &str = "public-lobby";
static UDP_STARTED: AtomicBool = AtomicBool::new(false);
static TCP_STARTED: AtomicBool = AtomicBool::new(false);
static FILE_SERVER_STARTED: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanChatWireMessage {
    pub protocol: String,
    pub kind: String,
    pub device_id: String,
    pub nickname: String,
    pub port: u16,
    pub room_id: Option<String>,
    pub room_name: Option<String>,
    pub room_channel: Option<String>,
    pub target_device_id: Option<String>,
    pub conversation_type: Option<String>,
    pub message_type: Option<String>,
    pub content: Option<String>,
    pub metadata_json: Option<String>,
    pub message_id: Option<String>,
    pub created_at: Option<String>,
}

fn open_db(app_handle: &tauri::AppHandle) -> Result<Connection, String> {
    let db_path = crate::db::init::db_path(app_handle)?;
    Connection::open(db_path).map_err(|err| format!("failed to open db: {err}"))
}

fn local_identity(app_handle: &tauri::AppHandle) -> Result<(String, String, u16), String> {
    let conn = open_db(app_handle)?;
    conn.query_row(
        "SELECT device_id, nickname, port FROM lan_chat_devices WHERE is_local = 1 LIMIT 1",
        [],
        |row| Ok((row.get(0)?, row.get(1)?, row.get::<_, i64>(2)? as u16)),
    )
    .map_err(|err| format!("failed to load LAN Chat identity for discovery: {err}"))
}

fn upsert_device(
    app_handle: &tauri::AppHandle,
    wire: &LanChatWireMessage,
    source: SocketAddr,
) -> Result<(), String> {
    let (local_device_id, _, _) = local_identity(app_handle)?;
    if wire.device_id == local_device_id {
        return Ok(());
    }
    let conn = open_db(app_handle)?;
    let now = Utc::now().to_rfc3339();
    let host = source.ip().to_string();
    conn.execute(
        "INSERT INTO lan_chat_devices
         (id, device_id, nickname, host, port, online, is_local, last_seen, client_version, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 1, 0, ?6, ?7, ?6, ?6)
         ON CONFLICT(device_id) DO UPDATE SET nickname = excluded.nickname, host = excluded.host, port = excluded.port, online = 1, last_seen = excluded.last_seen, updated_at = excluded.updated_at",
        params![
            Uuid::new_v4().to_string(),
            wire.device_id,
            wire.nickname,
            host,
            wire.port as i64,
            now,
            app_handle.package_info().version.to_string(),
        ],
    )
    .map_err(|err| format!("failed to save discovered LAN Chat device: {err}"))?;
    crate::dev_log::record(
        app_handle,
        "info",
        "lan-chat.discovery",
        "Discovered LAN Chat device",
        Some(format!("{} {}:{}", wire.nickname, host, wire.port)),
    );
    Ok(())
}

fn upsert_room(app_handle: &tauri::AppHandle, wire: &LanChatWireMessage) -> Result<(), String> {
    let Some(room_id) = wire.room_id.as_deref().filter(|value| !value.is_empty()) else {
        return Ok(());
    };
    if room_id != PUBLIC_ROOM_ID {
        return Ok(());
    }
    let Some(room_name) = wire.room_name.as_deref().filter(|value| !value.is_empty()) else {
        return Ok(());
    };
    let conn = open_db(app_handle)?;
    let now = Utc::now().to_rfc3339();
    let channel = wire.room_channel.as_deref().unwrap_or("udp");
    conn.execute(
        "INSERT INTO lan_chat_rooms (id, name, coordinator_device_id, channel, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?5)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, coordinator_device_id = excluded.coordinator_device_id, channel = excluded.channel, status = 'active', updated_at = excluded.updated_at",
        params![room_id, room_name, wire.device_id, channel, now],
    )
    .map_err(|err| format!("failed to save discovered LAN Chat room: {err}"))?;
    crate::dev_log::record(
        app_handle,
        "info",
        "lan-chat.discovery",
        "Discovered LAN Chat room",
        Some(format!("{room_name} ({room_id})")),
    );
    Ok(())
}

fn save_incoming_message(app_handle: &tauri::AppHandle, wire: &LanChatWireMessage) -> Result<(), String> {
    let (local_device_id, _, _) = local_identity(app_handle)?;
    if wire.device_id == local_device_id {
        return Ok(());
    }
    if let Some(target) = wire.target_device_id.as_deref() {
        if target != local_device_id {
            return Ok(());
        }
    }
    let Some(conversation_type) = wire.conversation_type.as_deref() else {
        return Ok(());
    };
    let Some(content) = wire.content.as_deref().filter(|value| !value.trim().is_empty()) else {
        return Ok(());
    };
    let conversation_id = if conversation_type == "direct" {
        format!("direct:{}", wire.device_id)
    } else {
        let room_id = wire.room_id.clone().unwrap_or_default();
        if room_id != PUBLIC_ROOM_ID {
            return Ok(());
        }
        room_id
    };
    if conversation_id.is_empty() {
        return Ok(());
    }
    let conn = open_db(app_handle)?;
    let created_at = wire.created_at.clone().unwrap_or_else(|| Utc::now().to_rfc3339());
    let message_id = wire.message_id.clone().unwrap_or_else(|| Uuid::new_v4().to_string());
    conn.execute(
        "INSERT OR IGNORE INTO lan_chat_messages
         (id, conversation_id, conversation_type, sender_device_id, message_type, content, metadata_json, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'received', ?8)",
        params![
            message_id,
            conversation_id,
            conversation_type,
            wire.device_id,
            wire.message_type.as_deref().unwrap_or("text"),
            content,
            wire.metadata_json.as_deref().unwrap_or("{}"),
            created_at
        ],
    )
    .map_err(|err| format!("failed to save incoming LAN Chat message: {err}"))?;
    crate::dev_log::record(
        app_handle,
        "info",
        "lan-chat.tcp",
        "Received LAN Chat message",
        Some(format!("from={} conversation={conversation_id}", wire.device_id)),
    );
    Ok(())
}

fn handle_wire_message(
    app_handle: &tauri::AppHandle,
    bytes: &[u8],
    source: SocketAddr,
    allow_presence_reply: bool,
) -> Result<(), String> {
    let wire: LanChatWireMessage = serde_json::from_slice(bytes)
        .map_err(|err| format!("failed to decode LAN Chat UDP packet: {err}"))?;
    if wire.protocol != PROTOCOL {
        return Ok(());
    }
    upsert_device(app_handle, &wire, source)?;
    match wire.kind.as_str() {
        "presence" => {
            if allow_presence_reply {
                let _ = send_presence_reply(app_handle, source, &wire);
            }
            Ok(())
        }
        "presenceReply" => Ok(()),
        "room" => upsert_room(app_handle, &wire),
        "message" => {
            upsert_room(app_handle, &wire)?;
            save_incoming_message(app_handle, &wire)
        }
        _ => Ok(()),
    }
}

fn send_presence_reply(
    app_handle: &tauri::AppHandle,
    source: SocketAddr,
    request: &LanChatWireMessage,
) -> Result<(), String> {
    let (device_id, nickname, port) = local_identity(app_handle)?;
    let target = SocketAddr::new(source.ip(), request.port);
    let wire = LanChatWireMessage {
        protocol: PROTOCOL.to_string(),
        kind: "presenceReply".to_string(),
        device_id,
        nickname,
        port,
        room_id: None,
        room_name: None,
        room_channel: None,
        target_device_id: None,
        conversation_type: None,
        message_type: None,
        content: None,
        metadata_json: None,
        message_id: None,
        created_at: Some(Utc::now().to_rfc3339()),
    };
    send_to(target.to_string(), &wire)
}

fn presence_wire(app_handle: &tauri::AppHandle) -> Result<LanChatWireMessage, String> {
    let (device_id, nickname, port) = local_identity(app_handle)?;
    Ok(LanChatWireMessage {
        protocol: PROTOCOL.to_string(),
        kind: "presence".to_string(),
        device_id,
        nickname,
        port,
        room_id: None,
        room_name: None,
        room_channel: None,
        target_device_id: None,
        conversation_type: None,
        message_type: None,
        content: None,
        metadata_json: None,
        message_id: None,
        created_at: Some(Utc::now().to_rfc3339()),
    })
}

fn send_with_socket(socket: &UdpSocket, address: String, wire: &LanChatWireMessage) -> Result<(), String> {
    let payload = serde_json::to_vec(wire)
        .map_err(|err| format!("failed to encode LAN Chat UDP packet: {err}"))?;
    socket
        .send_to(&payload, address)
        .map_err(|err| format!("failed to send LAN Chat UDP packet: {err}"))?;
    Ok(())
}

pub fn start(app_handle: tauri::AppHandle) {
    start_tcp(app_handle.clone());
    start_file_server(app_handle.clone());
    if UDP_STARTED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }

    std::thread::spawn(move || {
        let port = local_identity(&app_handle)
            .map(|(_, _, port)| port)
            .unwrap_or(DEFAULT_PORT);
        let socket = match UdpSocket::bind(("0.0.0.0", port)) {
            Ok(socket) => {
                crate::dev_log::record(
                    &app_handle,
                    "info",
                    "lan-chat.udp",
                    "UDP discovery listener started",
                    Some(format!("0.0.0.0:{port}")),
                );
                socket
            }
            Err(err) => {
                UDP_STARTED.store(false, Ordering::SeqCst);
                crate::dev_log::record(
                    &app_handle,
                    "error",
                    "lan-chat.udp",
                    "Failed to bind UDP discovery listener",
                    Some(format!("0.0.0.0:{port}: {err}")),
                );
                return;
            }
        };
        let _ = socket.set_read_timeout(Some(Duration::from_secs(1)));
        let _ = socket.set_broadcast(true);
        let mut buffer = [0_u8; 64 * 1024];
        let mut tick = 0_u8;
        loop {
            match socket.recv_from(&mut buffer) {
                Ok((size, source)) => {
                    let _ = handle_wire_message(&app_handle, &buffer[..size], source, true);
                }
                Err(err)
                    if err.kind() == std::io::ErrorKind::WouldBlock
                        || err.kind() == std::io::ErrorKind::TimedOut =>
                {
                    tick = tick.saturating_add(1);
                    if tick >= 3 {
                        tick = 0;
                        if let Ok(wire) = presence_wire(&app_handle) {
                            match send_with_socket(&socket, format!("255.255.255.255:{port}"), &wire) {
                                Ok(()) => crate::dev_log::record(
                                    &app_handle,
                                    "debug",
                                    "lan-chat.udp",
                                    "Broadcasted LAN Chat presence",
                                    Some(format!("255.255.255.255:{port}")),
                                ),
                                Err(err) => crate::dev_log::record(
                                    &app_handle,
                                    "error",
                                    "lan-chat.udp",
                                    "Failed to broadcast LAN Chat presence",
                                    Some(err),
                                ),
                            }
                        }
                    }
                }
                Err(err) => {
                    UDP_STARTED.store(false, Ordering::SeqCst);
                    crate::dev_log::record(
                        &app_handle,
                        "error",
                        "lan-chat.udp",
                        "UDP discovery listener stopped",
                        Some(err.to_string()),
                    );
                    break;
                }
            }
        }
    });
}

fn start_file_server(app_handle: tauri::AppHandle) {
    if FILE_SERVER_STARTED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }

    std::thread::spawn(move || {
        let port = local_identity(&app_handle)
            .map(|(_, _, port)| port.saturating_add(1))
            .unwrap_or(DEFAULT_PORT.saturating_add(1));
        let listener = match TcpListener::bind(("0.0.0.0", port)) {
            Ok(listener) => {
                crate::dev_log::record(
                    &app_handle,
                    "info",
                    "lan-chat.file",
                    "LAN Chat file server started",
                    Some(format!("0.0.0.0:{port}")),
                );
                listener
            }
            Err(err) => {
                FILE_SERVER_STARTED.store(false, Ordering::SeqCst);
                crate::dev_log::record(
                    &app_handle,
                    "error",
                    "lan-chat.file",
                    "Failed to bind LAN Chat file server",
                    Some(format!("0.0.0.0:{port}: {err}")),
                );
                return;
            }
        };
        for stream in listener.incoming().flatten() {
            let handle = app_handle.clone();
            std::thread::spawn(move || {
                let _ = handle_file_stream(&handle, stream);
            });
        }
    });
}

fn handle_file_stream(app_handle: &tauri::AppHandle, mut stream: TcpStream) -> Result<(), String> {
    let mut reader = BufReader::new(stream.try_clone().map_err(|err| err.to_string())?);
    let mut request_line = String::new();
    reader
        .read_line(&mut request_line)
        .map_err(|err| format!("failed to read LAN Chat file request: {err}"))?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let raw_path = parts.next().unwrap_or_default();
    if method != "GET" || !raw_path.starts_with("/lan-chat/file/") {
        write_http_response(&mut stream, 404, "text/plain", b"not found")?;
        return Ok(());
    }
    let Some((path_part, query)) = raw_path.split_once('?') else {
        write_http_response(&mut stream, 403, "text/plain", b"missing token")?;
        return Ok(());
    };
    let file_id = path_part.trim_start_matches("/lan-chat/file/");
    let token = query
        .split('&')
        .find_map(|item| item.strip_prefix("token="))
        .unwrap_or_default();
    if file_id.is_empty() || token.is_empty() || file_id.contains('/') || file_id.contains("..") {
        write_http_response(&mut stream, 403, "text/plain", b"invalid file request")?;
        return Ok(());
    }
    let conn = open_db(app_handle)?;
    let shared = conn.query_row(
        "SELECT path, mime_type FROM lan_chat_shared_files WHERE file_id = ?1 AND token = ?2 LIMIT 1",
        params![file_id, token],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
    );
    let Ok((path, mime_type)) = shared else {
        write_http_response(&mut stream, 404, "text/plain", b"file not found")?;
        return Ok(());
    };
    let mut file = match std::fs::File::open(&path) {
        Ok(file) => file,
        Err(_) => {
            write_http_response(&mut stream, 404, "text/plain", b"file missing")?;
            return Ok(());
        }
    };
    let size = file.metadata().map(|item| item.len()).unwrap_or(0);
    let header = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n",
        mime_type.unwrap_or_else(|| "application/octet-stream".to_string()),
        size
    );
    stream.write_all(header.as_bytes()).map_err(|err| err.to_string())?;
    std::io::copy(&mut file, &mut stream).map_err(|err| err.to_string())?;
    Ok(())
}

fn write_http_response(stream: &mut TcpStream, status: u16, content_type: &str, body: &[u8]) -> Result<(), String> {
    let reason = match status {
        200 => "OK",
        403 => "Forbidden",
        404 => "Not Found",
        _ => "Error",
    };
    let header = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(header.as_bytes()).map_err(|err| err.to_string())?;
    stream.write_all(body).map_err(|err| err.to_string())?;
    Ok(())
}

fn start_tcp(app_handle: tauri::AppHandle) {
    if TCP_STARTED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }

    std::thread::spawn(move || {
        let port = local_identity(&app_handle)
            .map(|(_, _, port)| port)
            .unwrap_or(DEFAULT_PORT);
        let listener = match TcpListener::bind(("0.0.0.0", port)) {
            Ok(listener) => {
                crate::dev_log::record(
                    &app_handle,
                    "info",
                    "lan-chat.tcp",
                    "TCP chat listener started",
                    Some(format!("0.0.0.0:{port}")),
                );
                listener
            }
            Err(err) => {
                TCP_STARTED.store(false, Ordering::SeqCst);
                crate::dev_log::record(
                    &app_handle,
                    "error",
                    "lan-chat.tcp",
                    "Failed to bind TCP chat listener",
                    Some(format!("0.0.0.0:{port}: {err}")),
                );
                return;
            }
        };
        for stream in listener.incoming() {
            let Ok(stream) = stream else {
                continue;
            };
            if let Ok(peer) = stream.peer_addr() {
                crate::dev_log::record(
                    &app_handle,
                    "info",
                    "lan-chat.tcp",
                    "Accepted TCP chat connection",
                    Some(peer.to_string()),
                );
            }
            let handle = app_handle.clone();
            std::thread::spawn(move || {
                if let Err(err) = handle_tcp_stream(&handle, stream) {
                    crate::dev_log::record(
                        &handle,
                        "error",
                        "lan-chat.tcp",
                        "Failed to handle TCP chat connection",
                        Some(err),
                    );
                }
            });
        }
    });
}

fn handle_tcp_stream(app_handle: &tauri::AppHandle, stream: TcpStream) -> Result<(), String> {
    let peer = stream
        .peer_addr()
        .map_err(|err| format!("failed to inspect LAN Chat TCP peer: {err}"))?;
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    reader
        .read_line(&mut line)
        .map_err(|err| format!("failed to read LAN Chat TCP message: {err}"))?;
    handle_wire_message(app_handle, line.as_bytes(), peer, false)
}

pub fn broadcast_presence(app_handle: &tauri::AppHandle) -> Result<(), String> {
    let (_, _, port) = local_identity(app_handle)?;
    let wire = presence_wire(app_handle)?;
    let result = broadcast_wire_message(port, &wire);
    if let Err(err) = &result {
        crate::dev_log::record(
            app_handle,
            "error",
            "lan-chat.udp",
            "Failed to broadcast presence",
            Some(err.clone()),
        );
    }
    result
}

pub fn broadcast_room(app_handle: &tauri::AppHandle, room_id: &str, room_name: &str, room_channel: &str) -> Result<(), String> {
    let (device_id, nickname, port) = local_identity(app_handle)?;
    let wire = LanChatWireMessage {
        protocol: PROTOCOL.to_string(),
        kind: "room".to_string(),
        device_id,
        nickname,
        port,
        room_id: Some(room_id.to_string()),
        room_name: Some(room_name.to_string()),
        room_channel: Some(room_channel.to_string()),
        target_device_id: None,
        conversation_type: None,
        message_type: None,
        content: None,
        metadata_json: None,
        message_id: None,
        created_at: Some(Utc::now().to_rfc3339()),
    };
    let result = broadcast_wire_message(port, &wire);
    crate::dev_log::record(
        app_handle,
        if result.is_ok() { "info" } else { "error" },
        "lan-chat.udp",
        if result.is_ok() {
            "Broadcasted LAN Chat room"
        } else {
            "Failed to broadcast LAN Chat room"
        },
        Some(format!("{room_name} ({room_id})")),
    );
    result
}

pub fn send_wire_message(
    app_handle: &tauri::AppHandle,
    mut wire: LanChatWireMessage,
    target: Option<(&str, u16)>,
) -> Result<(), String> {
    let (_, _, port) = local_identity(app_handle)?;
    wire.protocol = PROTOCOL.to_string();
    wire.kind = "message".to_string();
    if let Some((host, target_port)) = target.filter(|(host, _)| !host.trim().is_empty()) {
        let address = format!("{host}:{target_port}");
        let result = send_to_tcp(address.clone(), &wire);
        crate::dev_log::record(
            app_handle,
            if result.is_ok() { "info" } else { "error" },
            "lan-chat.tcp",
            if result.is_ok() {
                "Sent LAN Chat TCP message"
            } else {
                "Failed to send LAN Chat TCP message"
            },
            Some(address),
        );
        result
    } else {
        let result = broadcast_wire_message(port, &wire);
        crate::dev_log::record(
            app_handle,
            if result.is_ok() { "info" } else { "error" },
            "lan-chat.udp",
            if result.is_ok() {
                "Broadcasted LAN Chat message"
            } else {
                "Failed to broadcast LAN Chat message"
            },
            Some(format!("255.255.255.255:{port}")),
        );
        result
    }
}

pub fn send_udp_wire_message(
    app_handle: &tauri::AppHandle,
    mut wire: LanChatWireMessage,
    target: Option<(&str, u16)>,
) -> Result<(), String> {
    let (_, _, port) = local_identity(app_handle)?;
    wire.protocol = PROTOCOL.to_string();
    wire.kind = "message".to_string();
    let result = if let Some((host, target_port)) = target.filter(|(host, _)| !host.trim().is_empty()) {
        send_to(format!("{host}:{target_port}"), &wire)
    } else {
        broadcast_wire_message(port, &wire)
    };
    crate::dev_log::record(
        app_handle,
        if result.is_ok() { "info" } else { "error" },
        "lan-chat.udp",
        if result.is_ok() {
            "Sent LAN Chat UDP message"
        } else {
            "Failed to send LAN Chat UDP message"
        },
        target
            .map(|(host, target_port)| format!("{host}:{target_port}"))
            .or_else(|| Some(format!("255.255.255.255:{port}"))),
    );
    result
}

fn broadcast_wire_message(port: u16, wire: &LanChatWireMessage) -> Result<(), String> {
    send_to(format!("255.255.255.255:{port}"), wire)
}

fn send_to(address: String, wire: &LanChatWireMessage) -> Result<(), String> {
    let socket = UdpSocket::bind(("0.0.0.0", 0))
        .map_err(|err| format!("failed to open LAN Chat UDP socket: {err}"))?;
    socket
        .set_broadcast(true)
        .map_err(|err| format!("failed to enable LAN Chat UDP broadcast: {err}"))?;
    let payload = serde_json::to_vec(wire)
        .map_err(|err| format!("failed to encode LAN Chat UDP packet: {err}"))?;
    socket
        .send_to(&payload, address)
        .map_err(|err| format!("failed to send LAN Chat UDP packet: {err}"))?;
    Ok(())
}

fn send_to_tcp(address: String, wire: &LanChatWireMessage) -> Result<(), String> {
    let socket_addr: SocketAddr = address
        .parse()
        .map_err(|err| format!("invalid LAN Chat TCP address {address}: {err}"))?;
    let mut stream = TcpStream::connect_timeout(&socket_addr, Duration::from_secs(3))
    .map_err(|err| format!("failed to connect LAN Chat TCP peer {address}: {err}"))?;
    let payload = serde_json::to_string(wire)
        .map_err(|err| format!("failed to encode LAN Chat TCP message: {err}"))?;
    stream
        .write_all(payload.as_bytes())
        .and_then(|_| stream.write_all(b"\n"))
        .map_err(|err| format!("failed to send LAN Chat TCP message: {err}"))?;
    Ok(())
}
