use rusqlite::{params, Connection, OptionalExtension};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionInfo {
    pub id: String,
    pub name: String,
    pub group_name: Option<String>,
    pub host: String,
    pub port: u16,
    pub db_index: u8,
    pub connection_type: String,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionForm {
    pub id: Option<String>,
    pub name: String,
    pub group_name: Option<String>,
    pub host: String,
    pub port: u16,
    pub password: Option<String>,
    pub db_index: u8,
    pub connection_type: String,
}

fn open_db(app_handle: &tauri::AppHandle) -> Result<Connection, String> {
    let path = crate::db::init::db_path(app_handle)?;
    Connection::open(path).map_err(|err| format!("failed to open db: {err}"))
}

pub fn list_connections(app_handle: &tauri::AppHandle) -> Result<Vec<ConnectionInfo>, String> {
    let conn = open_db(app_handle)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, name, group_name, host, port, db_index, connection_type, created_at
            FROM connections
            ORDER BY created_at DESC
            "#,
        )
        .map_err(|err| format!("prepare list query failed: {err}"))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(ConnectionInfo {
                id: row.get(0)?,
                name: row.get(1)?,
                group_name: row.get(2)?,
                host: row.get(3)?,
                port: row.get(4)?,
                db_index: row.get(5)?,
                connection_type: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|err| format!("query list failed: {err}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("parse list row failed: {err}"))
}

pub fn get_connection(
    app_handle: &tauri::AppHandle,
    id: &str,
) -> Result<Option<ConnectionInfo>, String> {
    let conn = open_db(app_handle)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, name, group_name, host, port, db_index, connection_type, created_at
            FROM connections
            WHERE id = ?1
            "#,
        )
        .map_err(|err| format!("prepare get query failed: {err}"))?;

    stmt.query_row(params![id], |row| {
        Ok(ConnectionInfo {
            id: row.get(0)?,
            name: row.get(1)?,
            group_name: row.get(2)?,
            host: row.get(3)?,
            port: row.get(4)?,
            db_index: row.get(5)?,
            connection_type: row.get(6)?,
            created_at: row.get(7)?,
        })
    })
    .optional()
    .map_err(|err| format!("get connection failed: {err}"))
}

pub fn save_connection(app_handle: &tauri::AppHandle, form: ConnectionForm) -> Result<String, String> {
    let conn = open_db(app_handle)?;
    let id = form.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let created_at = chrono::Utc::now().to_rfc3339();
    let existing_password = get_password(app_handle, &id)?;
    let raw_password = form.password.unwrap_or_default();
    let password = if raw_password.is_empty() {
        existing_password.unwrap_or_default()
    } else {
        raw_password
    };
    let encrypted_password = crate::crypto::encrypt(app_handle, &password)?;

    conn.execute(
        r#"
        INSERT INTO connections (
          id, name, group_name, host, port, password_encrypted, db_index, connection_type, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          group_name = excluded.group_name,
          host = excluded.host,
          port = excluded.port,
          password_encrypted = excluded.password_encrypted,
          db_index = excluded.db_index,
          connection_type = excluded.connection_type
        "#,
        params![
            id,
            form.name,
            form.group_name,
            form.host,
            form.port,
            encrypted_password,
            form.db_index,
            form.connection_type,
            created_at
        ],
    )
    .map_err(|err| format!("save connection failed: {err}"))?;

    Ok(id)
}

pub fn delete_connection(app_handle: &tauri::AppHandle, id: &str) -> Result<(), String> {
    let conn = open_db(app_handle)?;
    conn.execute("DELETE FROM connections WHERE id = ?1", params![id])
        .map_err(|err| format!("delete connection failed: {err}"))?;
    Ok(())
}

pub fn get_password(app_handle: &tauri::AppHandle, id: &str) -> Result<Option<String>, String> {
    let conn = open_db(app_handle)?;
    let mut stmt = conn
        .prepare("SELECT password_encrypted FROM connections WHERE id = ?1")
        .map_err(|err| format!("prepare get password failed: {err}"))?;

    let encrypted: Option<String> = stmt
        .query_row(params![id], |row| row.get(0))
        .optional()
        .map_err(|err| format!("query password failed: {err}"))?;

    match encrypted {
        Some(value) => crate::crypto::decrypt(app_handle, &value).map(Some),
        None => Ok(None),
    }
}

pub fn update_connection_db_index(
    app_handle: &tauri::AppHandle,
    id: &str,
    db_index: u8,
) -> Result<(), String> {
    let conn = open_db(app_handle)?;
    let affected = conn
        .execute(
            "UPDATE connections SET db_index = ?1 WHERE id = ?2",
            params![db_index, id],
        )
        .map_err(|err| format!("update connection db index failed: {err}"))?;
    if affected == 0 {
        return Err(format!("connection `{id}` not found"));
    }
    Ok(())
}
