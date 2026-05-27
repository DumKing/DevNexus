#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfluenceConnectionInfo {
    pub id: String,
    pub label: String,
    pub base_url: String,
    pub username: String,
    pub auth_type: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfluenceConnectionForm {
    pub id: Option<String>,
    pub label: String,
    pub base_url: String,
    pub username: String,
    pub auth_type: Option<String>,
    pub password: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceInfo {
    pub key: String,
    pub name: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageInfo {
    pub id: String,
    pub title: String,
    pub version: u32,
    pub space_key: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentInfo {
    pub id: String,
    pub title: String,
    pub download_url: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfluenceTestResult {
    pub success: bool,
    pub duration_ms: u64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfluencePublishHistory {
    pub id: String,
    pub connection_id: String,
    pub space_key: String,
    pub page_id: String,
    pub page_title: String,
    pub page_version: u32,
    pub parent_id: Option<String>,
    pub parent_title: Option<String>,
    pub action: String,
    pub file_path: Option<String>,
    pub markdown_content: String,
    pub published_at: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfluencePublishHistoryForm {
    pub connection_id: String,
    pub space_key: String,
    pub page_id: String,
    pub page_title: String,
    pub page_version: u32,
    pub parent_id: Option<String>,
    pub parent_title: Option<String>,
    pub action: String,
    pub file_path: Option<String>,
    pub markdown_content: String,
}
