use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanChatDeviceIdentity {
    pub device_id: String,
    pub nickname: String,
    pub port: u16,
    pub download_dir: String,
    pub nickname_required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLanChatDeviceRequest {
    pub nickname: String,
    pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanChatDevice {
    pub device_id: String,
    pub nickname: String,
    pub host: Option<String>,
    pub port: u16,
    pub online: bool,
    pub is_local: bool,
    pub last_seen: Option<String>,
    pub client_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanChatRoom {
    pub id: String,
    pub name: String,
    pub coordinator_device_id: String,
    pub channel: String,
    pub is_system: bool,
    pub status: String,
    pub member_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanChatMessage {
    pub id: String,
    pub conversation_id: String,
    pub conversation_type: String,
    pub sender_device_id: String,
    pub message_type: String,
    pub content: String,
    pub metadata_json: String,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanChatTransfer {
    pub id: String,
    pub conversation_id: String,
    pub conversation_type: String,
    pub peer_device_id: Option<String>,
    pub file_name: String,
    pub file_size: i64,
    pub sha256: Option<String>,
    pub save_path: Option<String>,
    pub direction: String,
    pub status: String,
    pub progress: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanChatConversation {
    pub id: String,
    pub conversation_type: String,
    pub title: String,
    pub subtitle: String,
    pub unread_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanChatSnapshot {
    pub identity: LanChatDeviceIdentity,
    pub devices: Vec<LanChatDevice>,
    pub rooms: Vec<LanChatRoom>,
    pub transfers: Vec<LanChatTransfer>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLanChatRoomRequest {
    pub name: String,
    pub channel: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinLanChatRoomRequest {
    pub room_id: String,
    pub name: String,
    pub coordinator_device_id: Option<String>,
    pub channel: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLanChatRoomRequest {
    pub room_id: String,
    pub name: Option<String>,
    pub channel: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDirectConversationRequest {
    pub peer_device_id: String,
    pub peer_name: String,
    pub peer_host: Option<String>,
    pub peer_port: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendLanChatMessageRequest {
    pub conversation_id: String,
    pub conversation_type: String,
    pub message_type: String,
    pub content: String,
    pub metadata_json: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendLanChatFileRequest {
    pub conversation_id: String,
    pub conversation_type: String,
    pub file_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLanChatTransferRequest {
    pub conversation_id: String,
    pub conversation_type: String,
    pub peer_device_id: Option<String>,
    pub file_name: String,
    pub file_size: i64,
    pub direction: String,
}
