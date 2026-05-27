use rusqlite::Connection;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

pub fn data_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    app_handle
        .path()
        .app_data_dir()
        .map_err(|err| format!("failed to resolve app data dir: {err}"))
}

fn ensure_directory(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|err| format!("failed to create data dir: {err}"))
}

pub fn db_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = data_dir(app_handle)?;
    let current = data_dir.join("devnexus.db");
    let legacy = data_dir.join("rdmm.db");
    if !current.exists() && legacy.exists() {
        fs::rename(&legacy, &current)
            .map_err(|err| format!("failed to migrate legacy db path: {err}"))?;
    }
    Ok(current)
}

pub fn run(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = data_dir(app_handle)?;
    ensure_directory(&data_dir)?;

    let db_path = db_path(app_handle)?;
    let conn = Connection::open(&db_path).map_err(|err| format!("failed to open db: {err}"))?;

    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS connections (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          group_name TEXT,
          host TEXT NOT NULL,
          port INTEGER NOT NULL,
          password_encrypted TEXT,
          db_index INTEGER NOT NULL DEFAULT 0,
          connection_type TEXT NOT NULL DEFAULT 'Standalone',
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS query_history (
          id TEXT PRIMARY KEY NOT NULL,
          connection_id TEXT NOT NULL,
          command TEXT NOT NULL,
          executed_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ssh_keys (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          private_key_path TEXT NOT NULL,
          public_key TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ssh_connections (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          group_name TEXT,
          host TEXT NOT NULL,
          port INTEGER NOT NULL DEFAULT 22,
          username TEXT NOT NULL,
          auth_type TEXT NOT NULL,
          password_encrypted TEXT,
          key_id TEXT,
          key_passphrase_encrypted TEXT,
          jump_host_id TEXT,
          encoding TEXT NOT NULL DEFAULT 'utf-8',
          keepalive_interval INTEGER NOT NULL DEFAULT 30,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ssh_quick_commands (
          id TEXT PRIMARY KEY NOT NULL,
          connection_id TEXT,
          name TEXT NOT NULL,
          command TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS port_forward_rules (
          id TEXT PRIMARY KEY NOT NULL,
          connection_id TEXT NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          local_host TEXT,
          local_port INTEGER,
          remote_host TEXT,
          remote_port INTEGER,
          auto_start INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'stopped'
        );

        CREATE TABLE IF NOT EXISTS s3_connections (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          group_name TEXT,
          provider TEXT NOT NULL,
          endpoint TEXT,
          region TEXT NOT NULL,
          access_key_id TEXT NOT NULL,
          secret_access_key_encrypted TEXT NOT NULL,
          path_style INTEGER NOT NULL DEFAULT 0,
          default_bucket TEXT,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS mongodb_connections (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          group_name TEXT,
          mode TEXT NOT NULL DEFAULT 'uri',
          uri_encrypted TEXT,
          host TEXT,
          port INTEGER NOT NULL DEFAULT 27017,
          username TEXT,
          password_encrypted TEXT,
          auth_database TEXT,
          default_database TEXT,
          replica_set TEXT,
          tls INTEGER NOT NULL DEFAULT 0,
          srv INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS mongodb_query_history (
          id TEXT PRIMARY KEY NOT NULL,
          connection_id TEXT NOT NULL,
          database_name TEXT,
          collection_name TEXT,
          query_type TEXT NOT NULL,
          content TEXT NOT NULL,
          executed_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS mysql_connections (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          group_name TEXT,
          host TEXT NOT NULL,
          port INTEGER NOT NULL DEFAULT 3306,
          username TEXT NOT NULL,
          password_encrypted TEXT,
          default_database TEXT,
          charset TEXT NOT NULL DEFAULT 'utf8mb4',
          ssl_mode TEXT NOT NULL DEFAULT 'preferred',
          connect_timeout INTEGER NOT NULL DEFAULT 10,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS mysql_query_history (
          id TEXT PRIMARY KEY NOT NULL,
          connection_id TEXT NOT NULL,
          database_name TEXT,
          sql_text TEXT NOT NULL,
          executed_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS network_diagnostic_history (
          id TEXT PRIMARY KEY NOT NULL,
          tool_type TEXT NOT NULL,
          target TEXT NOT NULL,
          params_json TEXT NOT NULL,
          status TEXT NOT NULL,
          duration_ms INTEGER NOT NULL DEFAULT 0,
          summary TEXT NOT NULL,
          result_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS api_collections (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS api_folders (
          id TEXT PRIMARY KEY NOT NULL,
          collection_id TEXT NOT NULL,
          parent_id TEXT,
          name TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS api_requests (
          id TEXT PRIMARY KEY NOT NULL,
          collection_id TEXT,
          folder_id TEXT,
          name TEXT NOT NULL,
          method TEXT NOT NULL,
          url TEXT NOT NULL,
          params_json TEXT NOT NULL DEFAULT '[]',
          headers_json TEXT NOT NULL DEFAULT '[]',
          cookies_json TEXT NOT NULL DEFAULT '[]',
          auth_json TEXT NOT NULL DEFAULT 'null',
          body_json TEXT NOT NULL DEFAULT 'null',
          pre_request TEXT,
          timeout_ms INTEGER NOT NULL DEFAULT 30000,
          follow_redirects INTEGER NOT NULL DEFAULT 1,
          validate_ssl INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS api_environments (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          variables_json TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS api_request_history (
          id TEXT PRIMARY KEY NOT NULL,
          method TEXT NOT NULL,
          url TEXT NOT NULL,
          host TEXT,
          status TEXT NOT NULL,
          status_code INTEGER,
          duration_ms INTEGER NOT NULL DEFAULT 0,
          request_json TEXT NOT NULL,
          response_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS mq_connections (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          group_name TEXT,
          broker_type TEXT NOT NULL,
          hosts_json TEXT NOT NULL DEFAULT '[]',
          username TEXT,
          password_encrypted TEXT,
          connect_timeout INTEGER NOT NULL DEFAULT 10,
          rabbitmq_json TEXT,
          rabbitmq_management_password_encrypted TEXT,
          kafka_json TEXT,
          kafka_sasl_password_encrypted TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS mq_message_history (
          id TEXT PRIMARY KEY NOT NULL,
          broker_type TEXT NOT NULL,
          connection_id TEXT NOT NULL,
          operation_type TEXT NOT NULL,
          target TEXT NOT NULL,
          status TEXT NOT NULL,
          duration_ms INTEGER NOT NULL DEFAULT 0,
          request_json TEXT NOT NULL,
          result_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS mq_saved_messages (
          id TEXT PRIMARY KEY NOT NULL,
          broker_type TEXT NOT NULL,
          name TEXT NOT NULL,
          target TEXT,
          body_json TEXT NOT NULL,
          headers_json TEXT NOT NULL DEFAULT '[]',
          properties_json TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS lan_chat_devices (
          id TEXT PRIMARY KEY NOT NULL,
          device_id TEXT NOT NULL UNIQUE,
          nickname TEXT NOT NULL,
          host TEXT,
          port INTEGER NOT NULL DEFAULT 45881,
          online INTEGER NOT NULL DEFAULT 0,
          is_local INTEGER NOT NULL DEFAULT 0,
          last_seen TEXT,
          client_version TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS lan_chat_rooms (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          coordinator_device_id TEXT NOT NULL,
          channel TEXT NOT NULL DEFAULT 'udp',
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS lan_chat_room_members (
          id TEXT PRIMARY KEY NOT NULL,
          room_id TEXT NOT NULL,
          device_id TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'member',
          online INTEGER NOT NULL DEFAULT 0,
          last_seen TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS lan_chat_messages (
          id TEXT PRIMARY KEY NOT NULL,
          conversation_id TEXT NOT NULL,
          conversation_type TEXT NOT NULL,
          sender_device_id TEXT NOT NULL,
          message_type TEXT NOT NULL,
          content TEXT NOT NULL,
          metadata_json TEXT NOT NULL DEFAULT '{}',
          status TEXT NOT NULL DEFAULT 'sent',
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS lan_chat_transfers (
          id TEXT PRIMARY KEY NOT NULL,
          conversation_id TEXT NOT NULL,
          conversation_type TEXT NOT NULL,
          peer_device_id TEXT,
          file_name TEXT NOT NULL,
          file_size INTEGER NOT NULL DEFAULT 0,
          sha256 TEXT,
          save_path TEXT,
          direction TEXT NOT NULL,
          status TEXT NOT NULL,
          progress INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS lan_chat_shared_files (
          file_id TEXT PRIMARY KEY NOT NULL,
          token TEXT NOT NULL,
          path TEXT NOT NULL,
          file_name TEXT NOT NULL,
          mime_type TEXT,
          file_size INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS confluence_connections (
          id TEXT PRIMARY KEY NOT NULL,
          label TEXT NOT NULL,
          base_url TEXT NOT NULL,
          username TEXT NOT NULL,
          auth_type TEXT NOT NULL DEFAULT 'basic',
          password_encrypted TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS confluence_publish_history (
          id TEXT PRIMARY KEY NOT NULL,
          connection_id TEXT NOT NULL,
          space_key TEXT NOT NULL,
          page_id TEXT NOT NULL,
          page_title TEXT NOT NULL,
          page_version INTEGER NOT NULL DEFAULT 1,
          parent_id TEXT,
          parent_title TEXT,
          action TEXT NOT NULL,
          file_path TEXT,
          markdown_content TEXT NOT NULL,
          published_at TEXT NOT NULL
        );
        "#,
    )
    .map_err(|err| format!("failed to initialize schema: {err}"))?;

    let _ = conn.execute(
        "ALTER TABLE lan_chat_rooms ADD COLUMN channel TEXT NOT NULL DEFAULT 'udp'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE confluence_connections ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'basic'",
        [],
    );

    Ok(db_path)
}
