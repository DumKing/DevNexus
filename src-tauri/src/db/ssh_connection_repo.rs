use rusqlite::{params, Connection, OptionalExtension};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConnectionInfo {
    pub id: String,
    pub name: String,
    pub group_name: Option<String>,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: String,
    pub key_id: Option<String>,
    pub jump_host_id: Option<String>,
    pub encoding: String,
    pub keepalive_interval: u32,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConnectionForm {
    pub id: Option<String>,
    pub name: String,
    pub group_name: Option<String>,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: String,
    pub password: Option<String>,
    pub key_id: Option<String>,
    pub key_passphrase: Option<String>,
    pub jump_host_id: Option<String>,
    pub encoding: Option<String>,
    pub keepalive_interval: Option<u32>,
}

fn open_db(app_handle: &tauri::AppHandle) -> Result<Connection, String> {
    let path = crate::db::init::db_path(app_handle)?;
    Connection::open(path).map_err(|err| format!("failed to open db: {err}"))
}

pub fn list_ssh_connections(app_handle: &tauri::AppHandle) -> Result<Vec<SshConnectionInfo>, String> {
    let conn = open_db(app_handle)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT
              id, name, group_name, host, port, username, auth_type,
              key_id, jump_host_id, encoding, keepalive_interval, created_at
            FROM ssh_connections
            ORDER BY created_at DESC
            "#,
        )
        .map_err(|err| format!("prepare list ssh query failed: {err}"))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(SshConnectionInfo {
                id: row.get(0)?,
                name: row.get(1)?,
                group_name: row.get(2)?,
                host: row.get(3)?,
                port: row.get(4)?,
                username: row.get(5)?,
                auth_type: row.get(6)?,
                key_id: row.get(7)?,
                jump_host_id: row.get(8)?,
                encoding: row.get(9)?,
                keepalive_interval: row.get(10)?,
                created_at: row.get(11)?,
            })
        })
        .map_err(|err| format!("query list ssh failed: {err}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("parse list ssh row failed: {err}"))
}

pub fn get_ssh_connection(
    app_handle: &tauri::AppHandle,
    id: &str,
) -> Result<Option<SshConnectionInfo>, String> {
    let conn = open_db(app_handle)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT
              id, name, group_name, host, port, username, auth_type,
              key_id, jump_host_id, encoding, keepalive_interval, created_at
            FROM ssh_connections
            WHERE id = ?1
            "#,
        )
        .map_err(|err| format!("prepare get ssh query failed: {err}"))?;

    stmt.query_row(params![id], |row| {
        Ok(SshConnectionInfo {
            id: row.get(0)?,
            name: row.get(1)?,
            group_name: row.get(2)?,
            host: row.get(3)?,
            port: row.get(4)?,
            username: row.get(5)?,
            auth_type: row.get(6)?,
            key_id: row.get(7)?,
            jump_host_id: row.get(8)?,
            encoding: row.get(9)?,
            keepalive_interval: row.get(10)?,
            created_at: row.get(11)?,
        })
    })
    .optional()
    .map_err(|err| format!("get ssh connection failed: {err}"))
}

pub fn save_ssh_connection(app_handle: &tauri::AppHandle, form: SshConnectionForm) -> Result<String, String> {
    let conn = open_db(app_handle)?;
    let id = form.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let created_at = chrono::Utc::now().to_rfc3339();

    let (current_password, current_key_passphrase) = get_ssh_auth_secret(app_handle, &id)?;
    let raw_password = form.password.unwrap_or_default();
    let password = if raw_password.is_empty() {
        current_password.unwrap_or_default()
    } else {
        raw_password
    };
    let raw_key_passphrase = form.key_passphrase.unwrap_or_default();
    let key_passphrase = if raw_key_passphrase.is_empty() {
        current_key_passphrase.unwrap_or_default()
    } else {
        raw_key_passphrase
    };
    let password_encrypted = crate::crypto::encrypt(app_handle, &password)?;
    let key_passphrase_encrypted = crate::crypto::encrypt(app_handle, &key_passphrase)?;

    conn.execute(
        r#"
        INSERT INTO ssh_connections (
          id, name, group_name, host, port, username, auth_type,
          password_encrypted, key_id, key_passphrase_encrypted, jump_host_id,
          encoding, keepalive_interval, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          group_name = excluded.group_name,
          host = excluded.host,
          port = excluded.port,
          username = excluded.username,
          auth_type = excluded.auth_type,
          password_encrypted = excluded.password_encrypted,
          key_id = excluded.key_id,
          key_passphrase_encrypted = excluded.key_passphrase_encrypted,
          jump_host_id = excluded.jump_host_id,
          encoding = excluded.encoding,
          keepalive_interval = excluded.keepalive_interval
        "#,
        params![
            id,
            form.name,
            form.group_name,
            form.host,
            form.port,
            form.username,
            form.auth_type,
            password_encrypted,
            form.key_id,
            key_passphrase_encrypted,
            form.jump_host_id,
            form.encoding.unwrap_or_else(|| "utf-8".to_string()),
            form.keepalive_interval.unwrap_or(30),
            created_at
        ],
    )
    .map_err(|err| format!("save ssh connection failed: {err}"))?;

    Ok(id)
}

pub fn delete_ssh_connection(app_handle: &tauri::AppHandle, id: &str) -> Result<(), String> {
    let conn = open_db(app_handle)?;
    conn.execute("DELETE FROM ssh_connections WHERE id = ?1", params![id])
        .map_err(|err| format!("delete ssh connection failed: {err}"))?;
    Ok(())
}

pub fn get_ssh_auth_secret(
    app_handle: &tauri::AppHandle,
    id: &str,
) -> Result<(Option<String>, Option<String>), String> {
    let conn = open_db(app_handle)?;
    let mut stmt = conn
        .prepare(
            "SELECT password_encrypted, key_passphrase_encrypted FROM ssh_connections WHERE id = ?1",
        )
        .map_err(|err| format!("prepare get ssh secret failed: {err}"))?;

    let pair: Option<(Option<String>, Option<String>)> = stmt
        .query_row(params![id], |row| Ok((row.get(0)?, row.get(1)?)))
        .optional()
        .map_err(|err| format!("query ssh secret failed: {err}"))?;

    if let Some((password_encrypted, passphrase_encrypted)) = pair {
        let password = password_encrypted
            .map(|v| crate::crypto::decrypt(app_handle, &v))
            .transpose()?;
        let passphrase = passphrase_encrypted
            .map(|v| crate::crypto::decrypt(app_handle, &v))
            .transpose()?;
        return Ok((password, passphrase));
    }

    Ok((None, None))
}

pub fn get_ssh_key_path(
    app_handle: &tauri::AppHandle,
    key_id: &str,
) -> Result<Option<String>, String> {
    let conn = open_db(app_handle)?;
    conn.query_row(
        "SELECT private_key_path FROM ssh_keys WHERE id = ?1",
        params![key_id],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|err| format!("query ssh key path failed: {err}"))
}
