use chrono::{Duration as ChronoDuration, Utc};
use base64::Engine as _;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use std::path::Path;
use std::sync::OnceLock;
use uuid::Uuid;

use super::discovery::{broadcast_presence, broadcast_room, send_udp_wire_message, send_wire_message, LanChatWireMessage};
use super::types::{
    CreateDirectConversationRequest, CreateLanChatRoomRequest, CreateLanChatTransferRequest,
    JoinLanChatRoomRequest, LanChatConversation, LanChatDevice, LanChatDeviceIdentity,
    LanChatMessage, LanChatRoom, LanChatSnapshot, LanChatTransfer, SendLanChatFileRequest,
    SendLanChatMessageRequest, UpdateLanChatDeviceRequest, UpdateLanChatRoomRequest,
};

const PUBLIC_ROOM_ID: &str = "public-lobby";
const PUBLIC_ROOM_NAME: &str = "公共聊天室";
const LAN_CHAT_UDP_SAFE_PAYLOAD_BYTES: usize = 48 * 1024;
const LAN_CHAT_FILE_REF_CONTENT: &str = "__DEVNEXUS_LAN_CHAT_FILE_REF__";

fn normalize_room_channel(value: Option<&str>) -> Result<String, String> {
    match value.map(str::trim).filter(|item| !item.is_empty()).unwrap_or("udp") {
        "udp" => Ok("udp".to_string()),
        "tcp" => Ok("tcp".to_string()),
        other => Err(format!("unsupported LAN Chat room channel: {other}")),
    }
}

fn default_nickname() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "DevNexus Device".to_string())
}

fn placeholder_nickname() -> String {
    "未设置昵称".to_string()
}

fn normalize_mac_address(value: &str) -> Option<String> {
    let hex: String = value
        .chars()
        .filter(|ch| ch.is_ascii_hexdigit())
        .map(|ch| ch.to_ascii_uppercase())
        .collect();
    if hex.len() != 12 || hex == "000000000000" {
        return None;
    }
    let first_byte = u8::from_str_radix(&hex[0..2], 16).ok()?;
    if first_byte & 1 == 1 {
        return None;
    }
    Some(
        hex.as_bytes()
            .chunks(2)
            .map(|chunk| std::str::from_utf8(chunk).unwrap_or_default())
            .collect::<Vec<_>>()
            .join(":"),
    )
}

#[cfg(target_os = "windows")]
fn read_stable_mac_device_id() -> Option<String> {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let output = std::process::Command::new("getmac")
        .args(["/fo", "csv", "/nh"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .lines()
        .filter_map(|line| line.split(',').next())
        .map(|value| value.trim_matches('"'))
        .find_map(normalize_mac_address)
}

#[cfg(not(target_os = "windows"))]
fn read_stable_mac_device_id() -> Option<String> {
    let entries = std::fs::read_dir("/sys/class/net").ok()?;
    entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_name().to_string_lossy() != "lo")
        .filter_map(|entry| std::fs::read_to_string(entry.path().join("address")).ok())
        .find_map(|value| normalize_mac_address(&value))
}

fn stable_mac_device_id() -> Option<String> {
    static DEVICE_ID: OnceLock<Option<String>> = OnceLock::new();
    DEVICE_ID.get_or_init(read_stable_mac_device_id).clone()
}

fn generated_device_id() -> String {
    stable_mac_device_id().unwrap_or_else(|| Uuid::new_v4().to_string())
}

fn infer_mime_type(path: &Path) -> String {
    match path.extension().and_then(|value| value.to_str()).unwrap_or_default().to_ascii_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "m4a" => "audio/mp4",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "txt" => "text/plain",
        "json" => "application/json",
        "pdf" => "application/pdf",
        "zip" => "application/zip",
        _ => "application/octet-stream",
    }
    .to_string()
}

fn message_type_from_mime(mime_type: &str) -> String {
    if mime_type.starts_with("image/") {
        "image".to_string()
    } else if mime_type.starts_with("audio/") {
        "audio".to_string()
    } else if mime_type.starts_with("video/") {
        "video".to_string()
    } else {
        "file".to_string()
    }
}

fn file_server_port(chat_port: u16) -> u16 {
    chat_port.saturating_add(1)
}

fn migrate_local_device_id(conn: &Connection, old_device_id: &str, next_device_id: &str) -> Result<(), String> {
    if old_device_id == next_device_id {
        return Ok(());
    }
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "DELETE FROM lan_chat_devices WHERE device_id = ?1 AND is_local = 0",
        params![next_device_id],
    )
    .map_err(|err| format!("failed to clear duplicate LAN Chat MAC identity: {err}"))?;
    conn.execute(
        "UPDATE lan_chat_devices SET device_id = ?1, updated_at = ?2 WHERE device_id = ?3 AND is_local = 1",
        params![next_device_id, now, old_device_id],
    )
    .map_err(|err| format!("failed to migrate LAN Chat identity to MAC address: {err}"))?;
    conn.execute(
        "UPDATE lan_chat_room_members SET device_id = ?1, updated_at = ?2 WHERE device_id = ?3",
        params![next_device_id, now, old_device_id],
    )
    .map_err(|err| format!("failed to migrate LAN Chat room members to MAC address: {err}"))?;
    conn.execute(
        "UPDATE lan_chat_rooms SET coordinator_device_id = ?1, updated_at = ?2 WHERE coordinator_device_id = ?3",
        params![next_device_id, now, old_device_id],
    )
    .map_err(|err| format!("failed to migrate LAN Chat room coordinators to MAC address: {err}"))?;
    conn.execute(
        "UPDATE lan_chat_messages SET sender_device_id = ?1 WHERE sender_device_id = ?2",
        params![next_device_id, old_device_id],
    )
    .map_err(|err| format!("failed to migrate LAN Chat message sender to MAC address: {err}"))?;
    Ok(())
}

fn nickname_requires_setup(nickname: &str) -> bool {
    let value = nickname.trim();
    value.is_empty() || value == default_nickname() || value == "DevNexus Device" || value == placeholder_nickname()
}

fn downloads_dir(app_handle: &tauri::AppHandle) -> Result<String, String> {
    let dir = crate::db::init::data_dir(app_handle)?.join("lan-chat").join("downloads");
    std::fs::create_dir_all(&dir)
        .map_err(|err| format!("failed to create LAN Chat downloads dir: {err}"))?;
    Ok(dir.to_string_lossy().to_string())
}

fn load_identity(conn: &Connection) -> Result<Option<LanChatDeviceIdentity>, String> {
    conn.query_row(
        "SELECT device_id, nickname, port FROM lan_chat_devices WHERE is_local = 1 LIMIT 1",
        [],
        |row| {
            Ok(LanChatDeviceIdentity {
                device_id: row.get(0)?,
                nickname: row.get(1)?,
                port: row.get::<_, i64>(2)? as u16,
                download_dir: String::new(),
                nickname_required: false,
            })
        },
    )
    .optional()
    .map_err(|err| format!("failed to load LAN Chat identity: {err}"))
}

fn ensure_public_room(conn: &Connection, identity: &LanChatDeviceIdentity) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO lan_chat_rooms (id, name, coordinator_device_id, channel, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'udp', 'active', ?4, ?4)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, channel = 'udp', status = 'active', updated_at = excluded.updated_at",
        params![PUBLIC_ROOM_ID, PUBLIC_ROOM_NAME, identity.device_id, now],
    )
    .map_err(|err| format!("failed to ensure LAN Chat public room: {err}"))?;
    let updated = conn.execute(
        "UPDATE lan_chat_room_members SET online = 1, last_seen = ?3, updated_at = ?3 WHERE room_id = ?1 AND device_id = ?2",
        params![PUBLIC_ROOM_ID, identity.device_id, now],
    )
    .map_err(|err| format!("failed to update LAN Chat public room membership: {err}"))?;
    if updated == 0 {
        conn.execute(
            "INSERT INTO lan_chat_room_members (id, room_id, device_id, role, online, last_seen, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'member', 1, ?4, ?4, ?4)",
            params![Uuid::new_v4().to_string(), PUBLIC_ROOM_ID, identity.device_id, now],
        )
        .map_err(|err| format!("failed to ensure LAN Chat public room membership: {err}"))?;
    }
    Ok(())
}

fn open_db(app_handle: &tauri::AppHandle) -> Result<Connection, String> {
    let db_path = crate::db::init::db_path(app_handle)?;
    Connection::open(db_path).map_err(|err| format!("failed to open db: {err}"))
}

fn expire_stale_devices(conn: &Connection) -> Result<(), String> {
    let cutoff = (Utc::now() - ChronoDuration::seconds(9)).to_rfc3339();
    conn.execute(
        "UPDATE lan_chat_devices SET online = 0 WHERE is_local = 0 AND online = 1 AND (last_seen IS NULL OR last_seen < ?1)",
        params![cutoff],
    )
    .map_err(|err| format!("failed to expire stale LAN Chat devices: {err}"))?;
    conn.execute(
        "UPDATE lan_chat_room_members
         SET online = 0
         WHERE online = 1
           AND device_id IN (
             SELECT device_id FROM lan_chat_devices WHERE is_local = 0 AND online = 0
           )",
        [],
    )
    .map_err(|err| format!("failed to expire stale LAN Chat room members: {err}"))?;
    Ok(())
}

fn ensure_identity(app_handle: &tauri::AppHandle) -> Result<LanChatDeviceIdentity, String> {
    cmd_lan_chat_get_device_identity(app_handle.clone())
}

#[tauri::command]
pub fn cmd_lan_chat_get_device_identity(
    app_handle: tauri::AppHandle,
) -> Result<LanChatDeviceIdentity, String> {
    let db_path = crate::db::init::db_path(&app_handle)?;
    let conn = Connection::open(db_path).map_err(|err| format!("failed to open db: {err}"))?;
    let download_dir = downloads_dir(&app_handle)?;

    if let Some(mut identity) = load_identity(&conn)? {
        if let Some(mac_device_id) = stable_mac_device_id() {
            if identity.device_id != mac_device_id {
                migrate_local_device_id(&conn, &identity.device_id, &mac_device_id)?;
                identity.device_id = mac_device_id;
            }
        }
        identity.download_dir = download_dir;
        identity.nickname_required = nickname_requires_setup(&identity.nickname);
        ensure_public_room(&conn, &identity)?;
        return Ok(identity);
    }

    let now = Utc::now().to_rfc3339();
    let identity = LanChatDeviceIdentity {
        device_id: generated_device_id(),
        nickname: placeholder_nickname(),
        port: 45881,
        download_dir,
        nickname_required: true,
    };

    conn.execute(
        r#"
        INSERT INTO lan_chat_devices (
          id, device_id, nickname, port, online, is_local, last_seen, client_version, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, 0, 1, ?5, ?6, ?5, ?5)
        "#,
        params![
            Uuid::new_v4().to_string(),
            identity.device_id,
            identity.nickname,
            identity.port as i64,
            now,
            app_handle.package_info().version.to_string(),
        ],
    )
    .map_err(|err| format!("failed to save LAN Chat identity: {err}"))?;
    ensure_public_room(&conn, &identity)?;

    Ok(identity)
}

#[tauri::command]
pub fn cmd_lan_chat_update_device_settings(
    app_handle: tauri::AppHandle,
    request: UpdateLanChatDeviceRequest,
) -> Result<LanChatDeviceIdentity, String> {
    if request.nickname.trim().is_empty() {
        return Err("nickname is required".to_string());
    }
    if nickname_requires_setup(request.nickname.trim()) {
        return Err("please set a recognizable LAN Chat nickname instead of the computer name".to_string());
    }
    if request.port == 0 {
        return Err("port must be greater than 0".to_string());
    }

    let db_path = crate::db::init::db_path(&app_handle)?;
    let conn = Connection::open(db_path).map_err(|err| format!("failed to open db: {err}"))?;
    let _ = cmd_lan_chat_get_device_identity(app_handle.clone())?;
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE lan_chat_devices SET nickname = ?1, port = ?2, updated_at = ?3 WHERE is_local = 1",
        params![request.nickname.trim(), request.port as i64, now],
    )
    .map_err(|err| format!("failed to update LAN Chat identity: {err}"))?;

    cmd_lan_chat_get_device_identity(app_handle)
}

#[tauri::command]
pub fn cmd_lan_chat_start_network(app_handle: tauri::AppHandle) -> Result<(), String> {
    let _ = ensure_identity(&app_handle)?;
    super::discovery::start(app_handle);
    Ok(())
}

#[tauri::command]
pub fn cmd_lan_chat_list_devices(app_handle: tauri::AppHandle) -> Result<Vec<LanChatDevice>, String> {
    let _ = ensure_identity(&app_handle)?;
    let conn = open_db(&app_handle)?;
    expire_stale_devices(&conn)?;
    let mut stmt = conn
        .prepare(
            "SELECT device_id, nickname, host, port, online, is_local, last_seen, client_version
             FROM lan_chat_devices ORDER BY is_local DESC, nickname ASC",
        )
        .map_err(|err| format!("failed to prepare LAN Chat devices query: {err}"))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(LanChatDevice {
                device_id: row.get(0)?,
                nickname: row.get(1)?,
                host: row.get(2)?,
                port: row.get::<_, i64>(3)? as u16,
                online: row.get::<_, i64>(4)? == 1,
                is_local: row.get::<_, i64>(5)? == 1,
                last_seen: row.get(6)?,
                client_version: row.get(7)?,
            })
        })
        .map_err(|err| format!("failed to load LAN Chat devices: {err}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("failed to map LAN Chat devices: {err}"))
}

#[tauri::command]
pub fn cmd_lan_chat_create_room(
    app_handle: tauri::AppHandle,
    request: CreateLanChatRoomRequest,
) -> Result<LanChatRoom, String> {
    let _ = (app_handle, request);
    Err("custom LAN Chat rooms have been removed; use the public room or direct chat".to_string())
}

#[allow(dead_code)]
fn cmd_lan_chat_create_room_legacy(
    app_handle: tauri::AppHandle,
    request: CreateLanChatRoomRequest,
) -> Result<LanChatRoom, String> {
    let name = request.name.trim();
    if name.is_empty() {
        return Err("room name is required".to_string());
    }
    let identity = ensure_identity(&app_handle)?;
    let conn = open_db(&app_handle)?;
    expire_stale_devices(&conn)?;
    let now = Utc::now().to_rfc3339();
    let room_id = Uuid::new_v4().to_string();
    let channel = normalize_room_channel(request.channel.as_deref())?;

    conn.execute(
        "INSERT INTO lan_chat_rooms (id, name, coordinator_device_id, channel, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?5)",
        params![room_id, name, identity.device_id, channel, now],
    )
    .map_err(|err| format!("failed to create LAN Chat room: {err}"))?;

    conn.execute(
        "INSERT INTO lan_chat_room_members (id, room_id, device_id, role, online, last_seen, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'coordinator', 1, ?4, ?4, ?4)",
        params![Uuid::new_v4().to_string(), room_id, identity.device_id, now],
    )
    .map_err(|err| format!("failed to add LAN Chat room member: {err}"))?;
    let _ = broadcast_room(&app_handle, &room_id, name, &channel);

    cmd_lan_chat_list_rooms(app_handle)?
        .into_iter()
        .find(|room| room.id == room_id)
        .ok_or_else(|| "created room not found".to_string())
}

#[tauri::command]
pub fn cmd_lan_chat_join_room(
    app_handle: tauri::AppHandle,
    request: JoinLanChatRoomRequest,
) -> Result<LanChatRoom, String> {
    let _ = (app_handle, request);
    Err("custom LAN Chat rooms have been removed; use the public room or direct chat".to_string())
}

#[allow(dead_code)]
fn cmd_lan_chat_join_room_legacy(
    app_handle: tauri::AppHandle,
    request: JoinLanChatRoomRequest,
) -> Result<LanChatRoom, String> {
    let room_id = request.room_id.trim();
    let name = request.name.trim();
    if room_id.is_empty() {
        return Err("room id is required".to_string());
    }
    if name.is_empty() {
        return Err("room name is required".to_string());
    }

    let identity = ensure_identity(&app_handle)?;
    let coordinator_device_id = request
        .coordinator_device_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(room_id)
        .to_string();
    let conn = open_db(&app_handle)?;
    let now = Utc::now().to_rfc3339();
    let channel = normalize_room_channel(request.channel.as_deref())?;

    conn.execute(
        "INSERT INTO lan_chat_rooms (id, name, coordinator_device_id, channel, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?5)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, coordinator_device_id = excluded.coordinator_device_id, channel = excluded.channel, status = 'active', updated_at = excluded.updated_at",
        params![room_id, name, coordinator_device_id, channel, now],
    )
    .map_err(|err| format!("failed to join LAN Chat room: {err}"))?;

    let updated = conn
        .execute(
            "UPDATE lan_chat_room_members SET online = 1, last_seen = ?3, updated_at = ?3 WHERE room_id = ?1 AND device_id = ?2",
            params![room_id, identity.device_id, now],
        )
        .map_err(|err| format!("failed to update LAN Chat room membership: {err}"))?;
    if updated == 0 {
        conn.execute(
            "INSERT INTO lan_chat_room_members (id, room_id, device_id, role, online, last_seen, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'member', 1, ?4, ?4, ?4)",
            params![Uuid::new_v4().to_string(), room_id, identity.device_id, now],
        )
        .map_err(|err| format!("failed to save LAN Chat room membership: {err}"))?;
    }

    cmd_lan_chat_list_rooms(app_handle)?
        .into_iter()
        .find(|room| room.id == room_id)
        .ok_or_else(|| "joined room not found".to_string())
}

#[tauri::command]
pub fn cmd_lan_chat_update_room(
    app_handle: tauri::AppHandle,
    request: UpdateLanChatRoomRequest,
) -> Result<LanChatRoom, String> {
    let room_id = request.room_id.trim();
    if room_id.is_empty() {
        return Err("room id is required".to_string());
    }
    if room_id == PUBLIC_ROOM_ID {
        return Err("public room cannot be renamed or reconfigured".to_string());
    }

    let next_name = request.name.as_deref().map(str::trim).filter(|value| !value.is_empty());
    let next_channel = request.channel.as_deref().map(str::trim).filter(|value| !value.is_empty());
    if next_name.is_none() && next_channel.is_none() {
        return Err("room name or channel is required".to_string());
    }
    let normalized_channel = if let Some(channel) = next_channel {
        Some(normalize_room_channel(Some(channel))?)
    } else {
        None
    };
    let identity = ensure_identity(&app_handle)?;
    let conn = open_db(&app_handle)?;
    let coordinator = conn
        .query_row(
            "SELECT coordinator_device_id FROM lan_chat_rooms WHERE id = ?1 LIMIT 1",
            params![room_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|err| format!("failed to load LAN Chat room coordinator: {err}"))?
        .ok_or_else(|| "room not found".to_string())?;
    if coordinator != identity.device_id {
        return Err("only the room coordinator can rename this room".to_string());
    }

    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE lan_chat_rooms
         SET name = COALESCE(?1, name), channel = COALESCE(?2, channel), updated_at = ?3
         WHERE id = ?4",
        params![next_name, normalized_channel, now, room_id],
    )
    .map_err(|err| format!("failed to update LAN Chat room: {err}"))?;
    if let Some(room) = cmd_lan_chat_list_rooms(app_handle.clone())?
        .into_iter()
        .find(|room| room.id == room_id)
    {
        let _ = broadcast_room(&app_handle, room_id, &room.name, &room.channel);
        return Ok(room);
    }

    Err("updated room not found".to_string())
}

#[tauri::command]
pub fn cmd_lan_chat_list_rooms(app_handle: tauri::AppHandle) -> Result<Vec<LanChatRoom>, String> {
    let _ = ensure_identity(&app_handle)?;
    let conn = open_db(&app_handle)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT r.id, r.name, r.coordinator_device_id, r.channel, r.status, r.created_at, r.updated_at,
                   COUNT(m.id) AS member_count
            FROM lan_chat_rooms r
            LEFT JOIN lan_chat_room_members m ON m.room_id = r.id
            WHERE r.id = 'public-lobby'
            GROUP BY r.id
            ORDER BY CASE WHEN r.id = 'public-lobby' THEN 0 ELSE 1 END, r.updated_at DESC
            "#,
        )
        .map_err(|err| format!("failed to prepare LAN Chat rooms query: {err}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(LanChatRoom {
                id: row.get(0)?,
                name: row.get(1)?,
                coordinator_device_id: row.get(2)?,
                channel: row.get(3)?,
                is_system: row.get::<_, String>(0)? == PUBLIC_ROOM_ID,
                status: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                member_count: row.get(7)?,
            })
        })
        .map_err(|err| format!("failed to load LAN Chat rooms: {err}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("failed to map LAN Chat rooms: {err}"))
}

#[tauri::command]
pub fn cmd_lan_chat_create_direct_conversation(
    app_handle: tauri::AppHandle,
    request: CreateDirectConversationRequest,
) -> Result<LanChatConversation, String> {
    let identity = ensure_identity(&app_handle)?;
    if request.peer_device_id.trim().is_empty() {
        return Err("peer device id is required".to_string());
    }
    if request.peer_device_id == identity.device_id {
        return Err("cannot create direct conversation with local device".to_string());
    }
    let peer_device_id = request.peer_device_id.trim().to_string();
    let peer_name = request.peer_name.trim().to_string();
    let peer_host = request
        .peer_host
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let peer_port = request.peer_port.unwrap_or(45881);
    let conn = open_db(&app_handle)?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR IGNORE INTO lan_chat_devices
         (id, device_id, nickname, host, port, online, is_local, last_seen, client_version, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 1, 0, ?6, ?7, ?6, ?6)",
        params![
            Uuid::new_v4().to_string(),
            &peer_device_id,
            &peer_name,
            peer_host.as_deref(),
            peer_port as i64,
            now,
            app_handle.package_info().version.to_string()
        ],
    )
    .map_err(|err| format!("failed to save direct peer: {err}"))?;
    conn.execute(
        "UPDATE lan_chat_devices SET nickname = ?1, host = COALESCE(?2, host), port = ?3, online = 1, last_seen = ?4, updated_at = ?4 WHERE device_id = ?5 AND is_local = 0",
        params![
            &peer_name,
            peer_host.as_deref(),
            peer_port as i64,
            now,
            &peer_device_id,
        ],
    )
    .map_err(|err| format!("failed to update direct peer endpoint: {err}"))?;

    Ok(LanChatConversation {
        id: format!("direct:{}", peer_device_id),
        conversation_type: "direct".to_string(),
        title: peer_name,
        subtitle: "P2P online chat".to_string(),
        unread_count: 0,
    })
}

#[tauri::command]
pub fn cmd_lan_chat_list_conversations(
    app_handle: tauri::AppHandle,
) -> Result<Vec<LanChatConversation>, String> {
    let identity = ensure_identity(&app_handle)?;
    let rooms = cmd_lan_chat_list_rooms(app_handle.clone())?
        .into_iter()
        .filter(|room| room.id == PUBLIC_ROOM_ID)
        .map(|room| LanChatConversation {
            id: room.id,
            conversation_type: "room".to_string(),
            title: room.name,
            subtitle: if room.is_system {
                format!("Public room · {}", room.channel.to_uppercase())
            } else if room.coordinator_device_id == identity.device_id {
                "You coordinate this room".to_string()
            } else {
                format!("Group room · {}", room.channel.to_uppercase())
            },
            unread_count: 0,
        });

    let devices = cmd_lan_chat_list_devices(app_handle)?
        .into_iter()
        .filter(|device| !device.is_local)
        .map(|device| LanChatConversation {
            id: format!("direct:{}", device.device_id),
            conversation_type: "direct".to_string(),
            title: device.nickname,
            subtitle: if device.online { "Online P2P".to_string() } else { "Offline".to_string() },
            unread_count: 0,
        });

    Ok(rooms.chain(devices).collect())
}

#[tauri::command]
pub fn cmd_lan_chat_send_message(
    app_handle: tauri::AppHandle,
    request: SendLanChatMessageRequest,
) -> Result<LanChatMessage, String> {
    if request.conversation_id.trim().is_empty() {
        return Err("conversation id is required".to_string());
    }
    if request.content.trim().is_empty() {
        return Err("message content is required".to_string());
    }
    let identity = ensure_identity(&app_handle)?;
    let conn = open_db(&app_handle)?;
    expire_stale_devices(&conn)?;
    let now = Utc::now().to_rfc3339();
    let target = if request.conversation_type == "direct" {
        let peer_device_id = request.conversation_id.trim_start_matches("direct:");
        let endpoint = conn.query_row(
            "SELECT host, port FROM lan_chat_devices WHERE device_id = ?1 AND is_local = 0 LIMIT 1",
            params![peer_device_id],
            |row| Ok((row.get::<_, Option<String>>(0)?, row.get::<_, i64>(1)? as u16)),
        )
        .optional()
        .map_err(|err| format!("failed to load LAN Chat peer endpoint: {err}"))?;
        if endpoint.as_ref().and_then(|item| item.0.as_deref()).is_none() {
            return Err("direct chat requires a discovered peer IP or a manually entered IP:Port".to_string());
        }
        endpoint
    } else {
        None
    };
    let room_info = if request.conversation_type == "room" {
        if request.conversation_id != PUBLIC_ROOM_ID {
            return Err("only the public LAN Chat room is supported".to_string());
        }
        conn.query_row(
            "SELECT name, channel FROM lan_chat_rooms WHERE id = ?1 LIMIT 1",
            params![request.conversation_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|err| format!("failed to load LAN Chat room: {err}"))?
        .ok_or_else(|| "room not found".to_string())?
    } else {
        (String::new(), String::new())
    };
    let room_targets = if request.conversation_type == "room" {
        let mut stmt = conn
            .prepare(
                "SELECT host, port FROM lan_chat_devices WHERE is_local = 0 AND online = 1 AND host IS NOT NULL ORDER BY nickname",
            )
            .map_err(|err| format!("failed to prepare LAN Chat room targets: {err}"))?;
        let targets = stmt
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? as u16)))
            .map_err(|err| format!("failed to load LAN Chat room targets: {err}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|err| format!("failed to map LAN Chat room targets: {err}"))?;
        targets
    } else {
        Vec::new()
    };
    let room_name = if request.conversation_type == "room" {
        Some(room_info.0.clone())
    } else {
        None
    };
    let message = LanChatMessage {
        id: Uuid::new_v4().to_string(),
        conversation_id: request.conversation_id,
        conversation_type: request.conversation_type,
        sender_device_id: identity.device_id,
        message_type: request.message_type,
        content: request.content,
        metadata_json: request.metadata_json.unwrap_or_else(|| "{}".to_string()),
        status: "sent".to_string(),
        created_at: now,
    };

    conn.execute(
        "INSERT INTO lan_chat_messages
         (id, conversation_id, conversation_type, sender_device_id, message_type, content, metadata_json, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            message.id,
            message.conversation_id,
            message.conversation_type,
            message.sender_device_id,
            message.message_type,
            message.content,
            message.metadata_json,
            message.status,
            message.created_at,
        ],
    )
    .map_err(|err| format!("failed to save LAN Chat message: {err}"))?;

    let peer_device_id = message.conversation_id.trim_start_matches("direct:");
    let wire = LanChatWireMessage {
        protocol: String::new(),
        kind: String::new(),
        device_id: message.sender_device_id.clone(),
        nickname: identity.nickname,
        port: identity.port,
        room_id: if message.conversation_type == "room" {
            Some(message.conversation_id.clone())
        } else {
            None
        },
        room_name,
        room_channel: if message.conversation_type == "room" {
            Some(room_info.1.clone())
        } else {
            None
        },
        target_device_id: if message.conversation_type == "direct" {
            if peer_device_id.starts_with("ip:") {
                None
            } else {
                Some(peer_device_id.to_string())
            }
        } else {
            None
        },
        conversation_type: Some(message.conversation_type.clone()),
        message_type: Some(message.message_type.clone()),
        content: Some(message.content.clone()),
        metadata_json: Some(message.metadata_json.clone()),
        message_id: Some(message.id.clone()),
        created_at: Some(message.created_at.clone()),
    };
    if message.conversation_type == "room" {
        if message.content.len() > LAN_CHAT_UDP_SAFE_PAYLOAD_BYTES {
            crate::dev_log::record(
                &app_handle,
                "info",
                "lan-chat.public-room",
                "Public room message exceeds UDP limit, using TCP unicast fallback",
                Some(format!("bytes={}", message.content.len())),
            );
            for (host, port) in room_targets {
                let _ = send_wire_message(&app_handle, wire.clone(), Some((&host, port)));
            }
        } else {
            let _ = send_udp_wire_message(&app_handle, wire.clone(), None);
            for (host, port) in room_targets {
                let _ = send_udp_wire_message(&app_handle, wire.clone(), Some((&host, port)));
            }
        }
    } else {
        send_wire_message(
            &app_handle,
            wire,
            target
                .as_ref()
                .and_then(|item| item.0.as_deref().map(|host| (host, item.1))),
        )?;
    }

    Ok(message)
}

#[tauri::command]
pub fn cmd_lan_chat_send_file_message(
    app_handle: tauri::AppHandle,
    request: SendLanChatFileRequest,
) -> Result<LanChatMessage, String> {
    if request.conversation_id.trim().is_empty() {
        return Err("conversation id is required".to_string());
    }
    let file_path = Path::new(request.file_path.trim());
    if !file_path.is_file() {
        return Err("selected file does not exist".to_string());
    }
    let metadata = std::fs::metadata(file_path)
        .map_err(|err| format!("failed to inspect selected file: {err}"))?;
    let file_name = file_path
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "selected file has no valid file name".to_string())?
        .to_string();
    let mime_type = infer_mime_type(file_path);
    let file_id = Uuid::new_v4().to_string();
    let token = Uuid::new_v4().to_string();
    let identity = ensure_identity(&app_handle)?;
    let conn = open_db(&app_handle)?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO lan_chat_shared_files (file_id, token, path, file_name, mime_type, file_size, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            file_id,
            token,
            file_path.to_string_lossy().to_string(),
            file_name,
            mime_type,
            metadata.len() as i64,
            now,
        ],
    )
    .map_err(|err| format!("failed to register LAN Chat shared file: {err}"))?;

    let metadata_json = serde_json::json!({
        "transferMode": "pull",
        "fileId": file_id,
        "token": token,
        "fileName": file_name,
        "fileSize": metadata.len() as i64,
        "mimeType": mime_type,
        "filePort": file_server_port(identity.port),
    })
    .to_string();

    cmd_lan_chat_send_message(
        app_handle,
        SendLanChatMessageRequest {
            conversation_id: request.conversation_id,
            conversation_type: request.conversation_type,
            message_type: message_type_from_mime(&mime_type),
            content: LAN_CHAT_FILE_REF_CONTENT.to_string(),
            metadata_json: Some(metadata_json),
        },
    )
}

#[tauri::command]
pub fn cmd_lan_chat_list_messages(
    app_handle: tauri::AppHandle,
    conversation_id: String,
    limit: Option<i64>,
) -> Result<Vec<LanChatMessage>, String> {
    let _ = ensure_identity(&app_handle)?;
    let conn = open_db(&app_handle)?;
    let limit = limit.unwrap_or(100).clamp(1, 500);
    let mut stmt = conn
        .prepare(
            "SELECT id, conversation_id, conversation_type, sender_device_id, message_type, content, metadata_json, status, created_at
             FROM lan_chat_messages WHERE conversation_id = ?1 ORDER BY created_at DESC LIMIT ?2",
        )
        .map_err(|err| format!("failed to prepare LAN Chat messages query: {err}"))?;
    let rows = stmt
        .query_map(params![conversation_id, limit], |row| {
            Ok(LanChatMessage {
                id: row.get(0)?,
                conversation_id: row.get(1)?,
                conversation_type: row.get(2)?,
                sender_device_id: row.get(3)?,
                message_type: row.get(4)?,
                content: row.get(5)?,
                metadata_json: row.get(6)?,
                status: row.get(7)?,
                created_at: row.get(8)?,
            })
        })
        .map_err(|err| format!("failed to load LAN Chat messages: {err}"))?;
    let mut messages = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("failed to map LAN Chat messages: {err}"))?;
    messages.reverse();
    Ok(messages)
}

#[tauri::command]
pub fn cmd_lan_chat_clear_conversation(
    app_handle: tauri::AppHandle,
    conversation_id: String,
) -> Result<(), String> {
    let identity = ensure_identity(&app_handle)?;
    let conn = open_db(&app_handle)?;

    conn.execute(
        "DELETE FROM lan_chat_messages WHERE conversation_id = ?1",
        params![conversation_id],
    )
    .map_err(|err| format!("failed to clear LAN Chat messages: {err}"))?;
    conn.execute(
        "DELETE FROM lan_chat_transfers WHERE conversation_id = ?1",
        params![conversation_id],
    )
    .map_err(|err| format!("failed to clear LAN Chat transfers: {err}"))?;

    if let Some(peer_device_id) = conversation_id.strip_prefix("direct:") {
        conn.execute(
            "DELETE FROM lan_chat_devices WHERE device_id = ?1 AND is_local = 0",
            params![peer_device_id],
        )
        .map_err(|err| format!("failed to clear LAN Chat peer: {err}"))?;
        return Ok(());
    }
    if conversation_id == PUBLIC_ROOM_ID {
        return Ok(());
    }

    conn.execute(
        "DELETE FROM lan_chat_room_members WHERE room_id = ?1 AND device_id = ?2",
        params![conversation_id, identity.device_id],
    )
    .map_err(|err| format!("failed to leave LAN Chat room: {err}"))?;
    conn.execute(
        "DELETE FROM lan_chat_rooms WHERE id = ?1",
        params![conversation_id],
    )
    .map_err(|err| format!("failed to clear LAN Chat room: {err}"))?;
    Ok(())
}

#[tauri::command]
pub fn cmd_lan_chat_create_transfer(
    app_handle: tauri::AppHandle,
    request: CreateLanChatTransferRequest,
) -> Result<LanChatTransfer, String> {
    if request.file_name.trim().is_empty() {
        return Err("file name is required".to_string());
    }
    let _ = ensure_identity(&app_handle)?;
    let conn = open_db(&app_handle)?;
    let now = Utc::now().to_rfc3339();
    let transfer = LanChatTransfer {
        id: Uuid::new_v4().to_string(),
        conversation_id: request.conversation_id,
        conversation_type: request.conversation_type,
        peer_device_id: request.peer_device_id,
        file_name: request.file_name,
        file_size: request.file_size.max(0),
        sha256: None,
        save_path: None,
        direction: request.direction,
        status: "queued".to_string(),
        progress: 0,
        created_at: now.clone(),
        updated_at: now,
    };
    conn.execute(
        "INSERT INTO lan_chat_transfers
         (id, conversation_id, conversation_type, peer_device_id, file_name, file_size, sha256, save_path, direction, status, progress, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            transfer.id,
            transfer.conversation_id,
            transfer.conversation_type,
            transfer.peer_device_id,
            transfer.file_name,
            transfer.file_size,
            transfer.sha256,
            transfer.save_path,
            transfer.direction,
            transfer.status,
            transfer.progress,
            transfer.created_at,
            transfer.updated_at,
        ],
    )
    .map_err(|err| format!("failed to create LAN Chat transfer: {err}"))?;
    Ok(transfer)
}

#[tauri::command]
pub fn cmd_lan_chat_list_transfers(
    app_handle: tauri::AppHandle,
) -> Result<Vec<LanChatTransfer>, String> {
    let _ = ensure_identity(&app_handle)?;
    let conn = open_db(&app_handle)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, conversation_id, conversation_type, peer_device_id, file_name, file_size, sha256, save_path, direction, status, progress, created_at, updated_at
             FROM lan_chat_transfers ORDER BY updated_at DESC LIMIT 100",
        )
        .map_err(|err| format!("failed to prepare LAN Chat transfers query: {err}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(LanChatTransfer {
                id: row.get(0)?,
                conversation_id: row.get(1)?,
                conversation_type: row.get(2)?,
                peer_device_id: row.get(3)?,
                file_name: row.get(4)?,
                file_size: row.get(5)?,
                sha256: row.get(6)?,
                save_path: row.get(7)?,
                direction: row.get(8)?,
                status: row.get(9)?,
                progress: row.get(10)?,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        })
        .map_err(|err| format!("failed to load LAN Chat transfers: {err}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("failed to map LAN Chat transfers: {err}"))
}

#[tauri::command]
pub fn cmd_lan_chat_clear_transfers(app_handle: tauri::AppHandle) -> Result<(), String> {
    let _ = ensure_identity(&app_handle)?;
    let conn = open_db(&app_handle)?;
    conn.execute("DELETE FROM lan_chat_transfers", [])
        .map_err(|err| format!("failed to clear LAN Chat transfers: {err}"))?;
    Ok(())
}

#[tauri::command]
pub fn cmd_lan_chat_save_message_attachment(
    app_handle: tauri::AppHandle,
    message_id: String,
    target_path: String,
) -> Result<String, String> {
    let _ = ensure_identity(&app_handle)?;
    let target_path = target_path.trim();
    if target_path.is_empty() {
        return Err("save path is required".to_string());
    }
    let conn = open_db(&app_handle)?;
    let (content, metadata_json, sender_device_id): (String, String, String) = conn
        .query_row(
            "SELECT content, metadata_json, sender_device_id FROM lan_chat_messages WHERE id = ?1 LIMIT 1",
            params![message_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|err| format!("failed to load LAN Chat attachment: {err}"))?
        .ok_or_else(|| "message attachment not found".to_string())?;
    let path = std::path::PathBuf::from(target_path);
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|err| format!("failed to create attachment save directory: {err}"))?;
        }
    }
    let metadata: Value = serde_json::from_str(&metadata_json).unwrap_or(Value::Null);
    if metadata.get("transferMode").and_then(Value::as_str) == Some("pull") {
        let file_id = metadata.get("fileId").and_then(Value::as_str).ok_or_else(|| "attachment file id is missing".to_string())?;
        let token = metadata.get("token").and_then(Value::as_str).ok_or_else(|| "attachment token is missing".to_string())?;
        let file_port = metadata.get("filePort").and_then(Value::as_u64).unwrap_or(45882) as u16;
        if let Ok(local) = conn.query_row(
            "SELECT path FROM lan_chat_shared_files WHERE file_id = ?1 AND token = ?2 LIMIT 1",
            params![file_id, token],
            |row| row.get::<_, String>(0),
        ) {
            std::fs::copy(local, &path)
                .map_err(|err| format!("failed to copy local LAN Chat attachment: {err}"))?;
        } else {
            let host = conn.query_row(
                "SELECT host FROM lan_chat_devices WHERE device_id = ?1 LIMIT 1",
                params![sender_device_id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()
            .map_err(|err| format!("failed to load LAN Chat sender endpoint: {err}"))?
            .flatten()
            .ok_or_else(|| "sender is offline or has no known LAN address".to_string())?;
            let url = format!("http://{host}:{file_port}/lan-chat/file/{file_id}?token={token}");
            let mut response = reqwest::blocking::get(url)
                .map_err(|err| format!("failed to download LAN Chat attachment: {err}"))?;
            if !response.status().is_success() {
                return Err(format!("failed to download LAN Chat attachment: HTTP {}", response.status()));
            }
            let mut output = std::fs::File::create(&path)
                .map_err(|err| format!("failed to create target attachment file: {err}"))?;
            response
                .copy_to(&mut output)
                .map_err(|err| format!("failed to save downloaded LAN Chat attachment: {err}"))?;
        }
    } else {
        let raw = content
            .split_once(',')
            .map(|(_, payload)| payload)
            .unwrap_or(content.as_str());
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(raw)
            .map_err(|err| format!("failed to decode LAN Chat attachment: {err}"))?;
        std::fs::write(&path, bytes)
            .map_err(|err| format!("failed to save LAN Chat attachment: {err}"))?;
    }
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn cmd_lan_chat_discovery_snapshot(
    app_handle: tauri::AppHandle,
) -> Result<LanChatSnapshot, String> {
    let identity = ensure_identity(&app_handle)?;
    let _ = broadcast_presence(&app_handle);
    for room in cmd_lan_chat_list_rooms(app_handle.clone())?
        .into_iter()
        .filter(|room| room.coordinator_device_id == identity.device_id)
    {
        let _ = broadcast_room(&app_handle, &room.id, &room.name, &room.channel);
    }
    Ok(LanChatSnapshot {
        identity,
        devices: cmd_lan_chat_list_devices(app_handle.clone())?,
        rooms: cmd_lan_chat_list_rooms(app_handle.clone())?,
        transfers: cmd_lan_chat_list_transfers(app_handle)?,
    })
}
