use std::collections::{HashMap, HashSet};
use std::fs;
use std::time::Duration;

use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE, COOKIE, USER_AGENT};
use reqwest::{Client, Method};
use rusqlite::{params, Connection, OptionalExtension};
use tokio::time::Instant;

use super::types::{
    ApiAuthConfig, ApiBodyConfig, ApiCollection, ApiEnvironment, ApiFolder, ApiHistoryFilter,
    ApiHistoryItem, ApiKeyValue, ApiResolvedPreview, ApiResponseData, ApiSaveRequestForm,
    ApiSavedRequest, ApiSendRequest, ApiTimingInfo,
};

const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS: u64 = 30_000;

fn open_db(app_handle: &tauri::AppHandle) -> Result<Connection, String> {
    let path = crate::db::init::db_path(app_handle)?;
    Connection::open(path).map_err(|err| format!("failed to open db: {err}"))
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn enabled_items(items: &[ApiKeyValue]) -> impl Iterator<Item = &ApiKeyValue> {
    items.iter().filter(|item| item.enabled && !item.key.trim().is_empty())
}

fn is_sensitive_key(key: &str) -> bool {
    let lowered = key.to_ascii_lowercase();
    lowered.contains("authorization")
        || lowered == "cookie"
        || lowered == "set-cookie"
        || lowered.contains("token")
        || lowered.contains("password")
        || lowered.contains("secret")
        || lowered.ends_with("key")
}

fn mask_value(value: &str) -> String {
    if value.is_empty() { String::new() } else { "***".to_string() }
}

fn mask_items(items: &[ApiKeyValue]) -> Vec<ApiKeyValue> {
    items
        .iter()
        .map(|item| ApiKeyValue {
            key: item.key.clone(),
            value: if is_sensitive_key(&item.key) || item.secret.unwrap_or(false) {
                mask_value(&item.value)
            } else {
                item.value.clone()
            },
            enabled: item.enabled,
            secret: item.secret,
        })
        .collect()
}

fn mask_auth(auth: &Option<ApiAuthConfig>) -> Option<ApiAuthConfig> {
    auth.as_ref().map(|auth| ApiAuthConfig {
        auth_type: auth.auth_type.clone(),
        username: auth.username.clone(),
        password: auth.password.as_ref().map(|value| mask_value(value)),
        token: auth.token.as_ref().map(|value| mask_value(value)),
        key: auth.key.clone(),
        value: auth.value.as_ref().map(|value| mask_value(value)),
        add_to: auth.add_to.clone(),
    })
}

fn mask_body(body: &Option<ApiBodyConfig>) -> Option<ApiBodyConfig> {
    body.as_ref().map(|body| ApiBodyConfig {
        body_type: body.body_type.clone(),
        raw: body.raw.clone(),
        form: body.form.as_ref().map(|items| mask_items(items)),
        multipart: body.multipart.as_ref().map(|items| mask_items(items)),
        binary_path: body.binary_path.clone(),
        content_type: body.content_type.clone(),
    })
}

fn request_snapshot(request: &ApiSendRequest, redact: bool) -> serde_json::Value {
    serde_json::json!({
        "requestId": request.request_id,
        "method": request.method,
        "url": request.url,
        "params": if redact { mask_items(&request.params) } else { request.params.clone() },
        "headers": if redact { mask_items(&request.headers) } else { request.headers.clone() },
        "cookies": if redact { mask_items(&request.cookies) } else { request.cookies.clone() },
        "auth": if redact { mask_auth(&request.auth) } else { request.auth.clone() },
        "body": if redact { mask_body(&request.body) } else { request.body.clone() },
        "timeoutMs": request.timeout_ms,
        "followRedirects": request.follow_redirects,
        "validateSsl": request.validate_ssl,
        "environmentId": request.environment_id,
    })
}

fn response_snapshot(response: &ApiResponseData) -> serde_json::Value {
    let body = response.body.chars().take(4096).collect::<String>();
    serde_json::json!({
        "status": response.status,
        "statusText": response.status_text,
        "durationMs": response.duration_ms,
        "sizeBytes": response.size_bytes,
        "headers": mask_items(&response.headers),
        "cookies": mask_items(&response.cookies),
        "body": if response.body.len() > body.len() { format!("{body}\n... [truncated in history]") } else { body },
        "bodyTruncated": response.body_truncated,
        "contentType": response.content_type,
        "redirectChain": response.redirect_chain,
        "error": response.error,
        "timing": response.timing,
    })
}

fn parse_variables_json(app_handle: &tauri::AppHandle, json: &str) -> Result<Vec<ApiKeyValue>, String> {
    let mut variables = serde_json::from_str::<Vec<ApiKeyValue>>(json).unwrap_or_default();
    for variable in variables.iter_mut() {
        if variable.secret.unwrap_or(false) && !variable.value.is_empty() {
            variable.value = crate::crypto::decrypt(app_handle, &variable.value)?;
        }
    }
    Ok(variables)
}

fn environment_variables(app_handle: &tauri::AppHandle, environment_id: &Option<String>) -> Result<Vec<ApiKeyValue>, String> {
    let Some(id) = environment_id else { return Ok(Vec::new()); };
    let conn = open_db(app_handle)?;
    let json = conn
        .query_row(
            "SELECT variables_json FROM api_environments WHERE id = ?1",
            params![id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|err| format!("query api environment failed: {err}"))?;
    match json {
        Some(json) => parse_variables_json(app_handle, &json),
        None => Err(format!("environment `{id}` not found")),
    }
}

fn variables_map(variables: &[ApiKeyValue]) -> HashMap<String, String> {
    enabled_items(variables).map(|item| (item.key.clone(), item.value.clone())).collect()
}

fn resolve_template(input: &str, vars: &HashMap<String, String>, missing: &mut HashSet<String>) -> String {
    let mut out = String::new();
    let mut rest = input;
    while let Some(start) = rest.find("{{") {
        out.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        if let Some(end) = after.find("}}") {
            let key = after[..end].trim();
            if let Some(value) = vars.get(key) {
                out.push_str(value);
            } else {
                missing.insert(key.to_string());
                out.push_str("{{");
                out.push_str(key);
                out.push_str("}}");
            }
            rest = &after[end + 2..];
        } else {
            out.push_str(&rest[start..]);
            rest = "";
        }
    }
    out.push_str(rest);
    out
}

fn resolve_items(items: &[ApiKeyValue], vars: &HashMap<String, String>, missing: &mut HashSet<String>) -> Vec<ApiKeyValue> {
    items
        .iter()
        .map(|item| ApiKeyValue {
            key: resolve_template(&item.key, vars, missing),
            value: resolve_template(&item.value, vars, missing),
            enabled: item.enabled,
            secret: item.secret,
        })
        .collect()
}

fn resolve_body(body: &Option<ApiBodyConfig>, vars: &HashMap<String, String>, missing: &mut HashSet<String>) -> Option<ApiBodyConfig> {
    body.as_ref().map(|body| ApiBodyConfig {
        body_type: body.body_type.clone(),
        raw: body.raw.as_ref().map(|value| resolve_template(value, vars, missing)),
        form: body.form.as_ref().map(|items| resolve_items(items, vars, missing)),
        multipart: body.multipart.as_ref().map(|items| resolve_items(items, vars, missing)),
        binary_path: body.binary_path.as_ref().map(|value| resolve_template(value, vars, missing)),
        content_type: body.content_type.clone(),
    })
}

fn resolve_request(app_handle: &tauri::AppHandle, request: &ApiSendRequest) -> Result<(ApiSendRequest, Vec<String>), String> {
    let vars = variables_map(&environment_variables(app_handle, &request.environment_id)?);
    let mut missing = HashSet::new();
    let resolved = ApiSendRequest {
        request_id: request.request_id.clone(),
        method: request.method.clone(),
        url: resolve_template(&request.url, &vars, &mut missing),
        params: resolve_items(&request.params, &vars, &mut missing),
        headers: resolve_items(&request.headers, &vars, &mut missing),
        cookies: resolve_items(&request.cookies, &vars, &mut missing),
        auth: request.auth.as_ref().map(|auth| ApiAuthConfig {
            auth_type: auth.auth_type.clone(),
            username: auth.username.as_ref().map(|value| resolve_template(value, &vars, &mut missing)),
            password: auth.password.as_ref().map(|value| resolve_template(value, &vars, &mut missing)),
            token: auth.token.as_ref().map(|value| resolve_template(value, &vars, &mut missing)),
            key: auth.key.as_ref().map(|value| resolve_template(value, &vars, &mut missing)),
            value: auth.value.as_ref().map(|value| resolve_template(value, &vars, &mut missing)),
            add_to: auth.add_to.clone(),
        }),
        body: resolve_body(&request.body, &vars, &mut missing),
        timeout_ms: request.timeout_ms,
        follow_redirects: request.follow_redirects,
        validate_ssl: request.validate_ssl,
        environment_id: request.environment_id.clone(),
        save_history: request.save_history,
    };
    let mut missing = missing.into_iter().collect::<Vec<_>>();
    missing.sort();
    Ok((resolved, missing))
}

fn append_query_params(url: &str, params: &[ApiKeyValue]) -> Result<String, String> {
    let mut parsed = reqwest::Url::parse(url).map_err(|err| format!("invalid url: {err}"))?;
    {
        let mut pairs = parsed.query_pairs_mut();
        for item in enabled_items(params) {
            pairs.append_pair(&item.key, &item.value);
        }
    }
    Ok(parsed.to_string())
}

fn add_api_key_query(url: String, auth: &Option<ApiAuthConfig>) -> Result<String, String> {
    let Some(auth) = auth else { return Ok(url); };
    if auth.auth_type != "apiKey" || auth.add_to.as_deref() != Some("query") {
        return Ok(url);
    }
    let mut parsed = reqwest::Url::parse(&url).map_err(|err| format!("invalid url: {err}"))?;
    if let (Some(key), Some(value)) = (&auth.key, &auth.value) {
        parsed.query_pairs_mut().append_pair(key, value);
    }
    Ok(parsed.to_string())
}

fn build_headers(request: &ApiSendRequest) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static("DevNexus API Debugger/0.7"));
    for item in enabled_items(&request.headers) {
        let name = HeaderName::from_bytes(item.key.as_bytes()).map_err(|err| format!("invalid header `{}`: {err}", item.key))?;
        let value = HeaderValue::from_str(&item.value).map_err(|err| format!("invalid header value `{}`: {err}", item.key))?;
        headers.insert(name, value);
    }
    let cookie_value = enabled_items(&request.cookies).map(|item| format!("{}={}", item.key, item.value)).collect::<Vec<_>>().join("; ");
    if !cookie_value.is_empty() {
        headers.insert(COOKIE, HeaderValue::from_str(&cookie_value).map_err(|err| format!("invalid cookie header: {err}"))?);
    }
    if let Some(auth) = &request.auth {
        match auth.auth_type.as_str() {
            "basic" => {
                use base64::Engine;
                let value = format!(
                    "Basic {}",
                    base64::engine::general_purpose::STANDARD.encode(format!("{}:{}", auth.username.clone().unwrap_or_default(), auth.password.clone().unwrap_or_default()))
                );
                headers.insert("authorization", HeaderValue::from_str(&value).map_err(|err| format!("invalid basic auth: {err}"))?);
            }
            "bearer" => {
                let value = format!("Bearer {}", auth.token.clone().unwrap_or_default());
                headers.insert("authorization", HeaderValue::from_str(&value).map_err(|err| format!("invalid bearer auth: {err}"))?);
            }
            "apiKey" if auth.add_to.as_deref() != Some("query") => {
                if let (Some(key), Some(value)) = (&auth.key, &auth.value) {
                    let name = HeaderName::from_bytes(key.as_bytes()).map_err(|err| format!("invalid api key header: {err}"))?;
                    headers.insert(name, HeaderValue::from_str(value).map_err(|err| format!("invalid api key value: {err}"))?);
                }
            }
            _ => {}
        }
    }
    Ok(headers)
}

fn apply_body(builder: reqwest::RequestBuilder, body: &Option<ApiBodyConfig>) -> Result<reqwest::RequestBuilder, String> {
    let Some(body) = body else { return Ok(builder); };
    match body.body_type.as_str() {
        "raw" | "json" | "xml" => {
            let mut builder = builder.body(body.raw.clone().unwrap_or_default());
            if let Some(content_type) = &body.content_type {
                builder = builder.header(CONTENT_TYPE, content_type);
            } else if body.body_type == "json" {
                builder = builder.header(CONTENT_TYPE, "application/json");
            } else if body.body_type == "xml" {
                builder = builder.header(CONTENT_TYPE, "application/xml");
            }
            Ok(builder)
        }
        "form" | "form-urlencoded" => {
            let form = body.form.clone().unwrap_or_default().into_iter().filter(|item| item.enabled).map(|item| (item.key, item.value)).collect::<Vec<_>>();
            Ok(builder.form(&form))
        }
        "multipart" => {
            let mut form = reqwest::multipart::Form::new();
            for item in body.multipart.clone().unwrap_or_default().into_iter().filter(|item| item.enabled) {
                form = form.text(item.key, item.value);
            }
            Ok(builder.multipart(form))
        }
        "binary" => {
            let Some(path) = &body.binary_path else { return Ok(builder); };
            let bytes = fs::read(path).map_err(|err| format!("failed to read binary body: {err}"))?;
            Ok(builder.body(bytes))
        }
        _ => Ok(builder),
    }
}

fn response_headers(headers: &HeaderMap) -> Vec<ApiKeyValue> {
    headers.iter().map(|(key, value)| ApiKeyValue {
        key: key.to_string(),
        value: value.to_str().unwrap_or("<binary>").to_string(),
        enabled: true,
        secret: Some(is_sensitive_key(key.as_str())),
    }).collect()
}

fn response_cookies(headers: &HeaderMap) -> Vec<ApiKeyValue> {
    headers.get_all("set-cookie").iter().enumerate().map(|(idx, value)| ApiKeyValue {
        key: format!("set-cookie-{idx}"),
        value: value.to_str().unwrap_or("<binary>").to_string(),
        enabled: true,
        secret: Some(true),
    }).collect()
}

fn classify_error(err: &reqwest::Error) -> String {
    if err.is_timeout() {
        format!("timeout: {err}")
    } else if err.is_connect() {
        format!("connection failed: {err}")
    } else if err.is_redirect() {
        format!("too many redirects: {err}")
    } else if err.is_decode() {
        format!("response decode failed: {err}")
    } else {
        format!("request failed: {err}")
    }
}

fn history_host(url: &str) -> String {
    reqwest::Url::parse(url).ok().and_then(|url| url.host_str().map(|host| host.to_string())).unwrap_or_default()
}

fn save_history(app_handle: &tauri::AppHandle, request: &ApiSendRequest, response: &ApiResponseData) -> Result<(), String> {
    let conn = open_db(app_handle)?;
    conn.execute(
        r#"
        INSERT INTO api_request_history (
          id, method, url, host, status, status_code, duration_ms, request_json, response_json, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        "#,
        params![
            new_id(),
            request.method.to_uppercase(),
            request.url,
            history_host(&request.url),
            if response.error.is_some() { "error" } else { "success" },
            response.status.map(|value| value as i64),
            response.duration_ms as i64,
            request_snapshot(request, true).to_string(),
            response_snapshot(response).to_string(),
            now(),
        ],
    ).map_err(|err| format!("save api history failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub fn cmd_api_preview_request(app_handle: tauri::AppHandle, request: ApiSendRequest) -> Result<ApiResolvedPreview, String> {
    let (resolved, missing) = resolve_request(&app_handle, &request)?;
    Ok(ApiResolvedPreview {
        url: add_api_key_query(append_query_params(&resolved.url, &resolved.params)?, &resolved.auth)?,
        headers: mask_items(&resolved.headers),
        cookies: mask_items(&resolved.cookies),
        body_preview: resolved.body.as_ref().and_then(|body| body.raw.clone()),
        missing_variables: missing,
    })
}

#[tauri::command]
pub async fn cmd_api_send_request(app_handle: tauri::AppHandle, request: ApiSendRequest) -> Result<ApiResponseData, String> {
    let started = Instant::now();
    let (resolved, missing) = resolve_request(&app_handle, &request)?;
    if !missing.is_empty() {
        return Err(format!("missing variables: {}", missing.join(", ")));
    }
    let timeout_ms = resolved.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS).clamp(500, 300_000);
    let client = Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .redirect(if resolved.follow_redirects.unwrap_or(true) { reqwest::redirect::Policy::limited(10) } else { reqwest::redirect::Policy::none() })
        .danger_accept_invalid_certs(!resolved.validate_ssl.unwrap_or(true))
        .build()
        .map_err(|err| format!("build http client failed: {err}"))?;
    let method = Method::from_bytes(resolved.method.to_uppercase().as_bytes()).map_err(|err| format!("invalid method: {err}"))?;
    let url = add_api_key_query(append_query_params(&resolved.url, &resolved.params)?, &resolved.auth)?;
    let builder = client.request(method, &url).headers(build_headers(&resolved)?);
    let builder = apply_body(builder, &resolved.body)?;
    let response = match builder.send().await {
        Ok(response) => response,
        Err(err) => {
            let duration = started.elapsed().as_millis() as u64;
            let data = ApiResponseData {
                status: None,
                status_text: None,
                duration_ms: duration,
                size_bytes: 0,
                headers: Vec::new(),
                cookies: Vec::new(),
                body: String::new(),
                body_truncated: false,
                content_type: None,
                redirect_chain: Vec::new(),
                error: Some(classify_error(&err)),
                timing: ApiTimingInfo { total_ms: duration },
            };
            if resolved.save_history.unwrap_or(true) {
                let _ = save_history(&app_handle, &resolved, &data);
            }
            return Ok(data);
        }
    };
    let status = response.status();
    let headers = response.headers().clone();
    let content_type = headers.get(CONTENT_TYPE).and_then(|value| value.to_str().ok()).map(|value| value.to_string());
    let bytes = response.bytes().await.map_err(|err| format!("read response body failed: {err}"))?;
    let size_bytes = bytes.len() as u64;
    let body_truncated = bytes.len() > MAX_RESPONSE_BYTES;
    let body_bytes = if body_truncated { &bytes[..MAX_RESPONSE_BYTES] } else { &bytes[..] };
    let mut body = String::from_utf8_lossy(body_bytes).to_string();
    if body_truncated {
        body.push_str("\n... [response body truncated by DevNexus]");
    }
    let duration = started.elapsed().as_millis() as u64;
    let data = ApiResponseData {
        status: Some(status.as_u16()),
        status_text: status.canonical_reason().map(|value| value.to_string()),
        duration_ms: duration,
        size_bytes,
        headers: response_headers(&headers),
        cookies: response_cookies(&headers),
        body,
        body_truncated,
        content_type,
        redirect_chain: Vec::new(),
        error: None,
        timing: ApiTimingInfo { total_ms: duration },
    };
    if resolved.save_history.unwrap_or(true) {
        save_history(&app_handle, &resolved, &data)?;
    }
    Ok(data)
}

#[tauri::command]
pub fn cmd_api_cancel_request(_request_id: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn cmd_api_list_collections(app_handle: tauri::AppHandle) -> Result<Vec<ApiCollection>, String> {
    let conn = open_db(&app_handle)?;
    let mut stmt = conn
        .prepare("SELECT id, name, description, created_at, updated_at FROM api_collections ORDER BY updated_at DESC")
        .map_err(|err| format!("prepare collections failed: {err}"))?;
    let rows = stmt
        .query_map([], |row| Ok(ApiCollection { id: row.get(0)?, name: row.get(1)?, description: row.get(2)?, created_at: row.get(3)?, updated_at: row.get(4)? }))
        .map_err(|err| format!("query collections failed: {err}"))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|err| format!("read collections failed: {err}"))
}

#[tauri::command]
pub fn cmd_api_save_collection(app_handle: tauri::AppHandle, id: Option<String>, name: String, description: Option<String>) -> Result<String, String> {
    let conn = open_db(&app_handle)?;
    let id = id.unwrap_or_else(new_id);
    let now = now();
    conn.execute(
        r#"
        INSERT INTO api_collections (id, name, description, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?4)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, updated_at = excluded.updated_at
        "#,
        params![id, name, description, now],
    ).map_err(|err| format!("save api collection failed: {err}"))?;
    Ok(id)
}

#[tauri::command]
pub fn cmd_api_delete_collection(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = open_db(&app_handle)?;
    conn.execute("DELETE FROM api_collections WHERE id = ?1", params![id]).map_err(|err| format!("delete api collection failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub fn cmd_api_list_folders(app_handle: tauri::AppHandle, collection_id: Option<String>) -> Result<Vec<ApiFolder>, String> {
    let conn = open_db(&app_handle)?;
    let sql_all = "SELECT id, collection_id, parent_id, name, sort_order, created_at, updated_at FROM api_folders ORDER BY sort_order, name";
    let sql_filtered = "SELECT id, collection_id, parent_id, name, sort_order, created_at, updated_at FROM api_folders WHERE collection_id = ?1 ORDER BY sort_order, name";
    let mut stmt = conn.prepare(if collection_id.is_some() { sql_filtered } else { sql_all }).map_err(|err| format!("prepare folders failed: {err}"))?;
    let mapper = |row: &rusqlite::Row<'_>| Ok(ApiFolder { id: row.get(0)?, collection_id: row.get(1)?, parent_id: row.get(2)?, name: row.get(3)?, sort_order: row.get(4)?, created_at: row.get(5)?, updated_at: row.get(6)? });
    let rows = if let Some(collection_id) = collection_id {
        stmt.query_map(params![collection_id], mapper).map_err(|err| format!("query folders failed: {err}"))?.collect::<Result<Vec<_>, _>>()
    } else {
        stmt.query_map([], mapper).map_err(|err| format!("query folders failed: {err}"))?.collect::<Result<Vec<_>, _>>()
    };
    rows.map_err(|err| format!("read folders failed: {err}"))
}

#[tauri::command]
pub fn cmd_api_save_folder(app_handle: tauri::AppHandle, id: Option<String>, collection_id: String, parent_id: Option<String>, name: String) -> Result<String, String> {
    let conn = open_db(&app_handle)?;
    let id = id.unwrap_or_else(new_id);
    let now = now();
    conn.execute(
        r#"
        INSERT INTO api_folders (id, collection_id, parent_id, name, sort_order, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, 0, ?5, ?5)
        ON CONFLICT(id) DO UPDATE SET collection_id = excluded.collection_id, parent_id = excluded.parent_id, name = excluded.name, updated_at = excluded.updated_at
        "#,
        params![id, collection_id, parent_id, name, now],
    ).map_err(|err| format!("save api folder failed: {err}"))?;
    Ok(id)
}

#[tauri::command]
pub fn cmd_api_delete_folder(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = open_db(&app_handle)?;
    conn.execute("DELETE FROM api_folders WHERE id = ?1", params![id]).map_err(|err| format!("delete api folder failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub fn cmd_api_list_requests(app_handle: tauri::AppHandle, collection_id: Option<String>) -> Result<Vec<ApiSavedRequest>, String> {
    let conn = open_db(&app_handle)?;
    let sql_all = "SELECT id, collection_id, folder_id, name, method, url, params_json, headers_json, cookies_json, auth_json, body_json, timeout_ms, follow_redirects, validate_ssl, created_at, updated_at FROM api_requests ORDER BY updated_at DESC";
    let sql_filtered = "SELECT id, collection_id, folder_id, name, method, url, params_json, headers_json, cookies_json, auth_json, body_json, timeout_ms, follow_redirects, validate_ssl, created_at, updated_at FROM api_requests WHERE collection_id = ?1 ORDER BY updated_at DESC";
    let mut stmt = conn.prepare(if collection_id.is_some() { sql_filtered } else { sql_all }).map_err(|err| format!("prepare requests failed: {err}"))?;
    let mapper = |row: &rusqlite::Row<'_>| Ok(ApiSavedRequest {
        id: row.get(0)?,
        collection_id: row.get(1)?,
        folder_id: row.get(2)?,
        name: row.get(3)?,
        method: row.get(4)?,
        url: row.get(5)?,
        params_json: row.get(6)?,
        headers_json: row.get(7)?,
        cookies_json: row.get(8)?,
        auth_json: row.get(9)?,
        body_json: row.get(10)?,
        timeout_ms: row.get::<_, i64>(11)? as u64,
        follow_redirects: row.get::<_, i64>(12)? != 0,
        validate_ssl: row.get::<_, i64>(13)? != 0,
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
    });
    let rows = if let Some(collection_id) = collection_id {
        stmt.query_map(params![collection_id], mapper).map_err(|err| format!("query requests failed: {err}"))?.collect::<Result<Vec<_>, _>>()
    } else {
        stmt.query_map([], mapper).map_err(|err| format!("query requests failed: {err}"))?.collect::<Result<Vec<_>, _>>()
    };
    rows.map_err(|err| format!("read requests failed: {err}"))
}

#[tauri::command]
pub fn cmd_api_save_request(app_handle: tauri::AppHandle, form: ApiSaveRequestForm) -> Result<String, String> {
    let conn = open_db(&app_handle)?;
    let id = form.id.unwrap_or_else(new_id);
    let now = now();
    conn.execute(
        r#"
        INSERT INTO api_requests (id, collection_id, folder_id, name, method, url, params_json, headers_json, cookies_json, auth_json, body_json, pre_request, timeout_ms, follow_redirects, validate_ssl, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, '', ?12, ?13, ?14, ?15, ?15)
        ON CONFLICT(id) DO UPDATE SET collection_id = excluded.collection_id, folder_id = excluded.folder_id, name = excluded.name, method = excluded.method, url = excluded.url, params_json = excluded.params_json, headers_json = excluded.headers_json, cookies_json = excluded.cookies_json, auth_json = excluded.auth_json, body_json = excluded.body_json, timeout_ms = excluded.timeout_ms, follow_redirects = excluded.follow_redirects, validate_ssl = excluded.validate_ssl, updated_at = excluded.updated_at
        "#,
        params![
            id,
            form.collection_id,
            form.folder_id,
            form.name,
            form.request.method,
            form.request.url,
            serde_json::to_string(&form.request.params).unwrap_or_default(),
            serde_json::to_string(&form.request.headers).unwrap_or_default(),
            serde_json::to_string(&form.request.cookies).unwrap_or_default(),
            serde_json::to_string(&form.request.auth).unwrap_or_default(),
            serde_json::to_string(&form.request.body).unwrap_or_default(),
            form.request.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS) as i64,
            if form.request.follow_redirects.unwrap_or(true) { 1 } else { 0 },
            if form.request.validate_ssl.unwrap_or(true) { 1 } else { 0 },
            now
        ],
    ).map_err(|err| format!("save api request failed: {err}"))?;
    Ok(id)
}

#[tauri::command]
pub fn cmd_api_delete_request(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = open_db(&app_handle)?;
    conn.execute("DELETE FROM api_requests WHERE id = ?1", params![id]).map_err(|err| format!("delete api request failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub fn cmd_api_list_environments(app_handle: tauri::AppHandle) -> Result<Vec<ApiEnvironment>, String> {
    let conn = open_db(&app_handle)?;
    let mut stmt = conn.prepare("SELECT id, name, variables_json, created_at, updated_at FROM api_environments ORDER BY updated_at DESC").map_err(|err| format!("prepare environments failed: {err}"))?;
    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, String>(4)?)))
        .map_err(|err| format!("query environments failed: {err}"))?;
    let mut out = Vec::new();
    for row in rows {
        let (id, name, json, created_at, updated_at) = row.map_err(|err| format!("read environment failed: {err}"))?;
        out.push(ApiEnvironment { id, name, variables: parse_variables_json(&app_handle, &json)?, created_at, updated_at });
    }
    Ok(out)
}

#[tauri::command]
pub fn cmd_api_save_environment(app_handle: tauri::AppHandle, id: Option<String>, name: String, variables: Vec<ApiKeyValue>) -> Result<String, String> {
    let conn = open_db(&app_handle)?;
    let id = id.unwrap_or_else(new_id);
    let now = now();
    let mut stored = variables;
    for variable in stored.iter_mut() {
        if variable.secret.unwrap_or(false) && !variable.value.is_empty() && variable.value != "***" {
            variable.value = crate::crypto::encrypt(&app_handle, &variable.value)?;
        }
    }
    conn.execute(
        r#"
        INSERT INTO api_environments (id, name, variables_json, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?4)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, variables_json = excluded.variables_json, updated_at = excluded.updated_at
        "#,
        params![id, name, serde_json::to_string(&stored).unwrap_or_default(), now],
    ).map_err(|err| format!("save api environment failed: {err}"))?;
    Ok(id)
}

#[tauri::command]
pub fn cmd_api_delete_environment(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = open_db(&app_handle)?;
    conn.execute("DELETE FROM api_environments WHERE id = ?1", params![id]).map_err(|err| format!("delete api environment failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub fn cmd_api_list_history(app_handle: tauri::AppHandle, filter: Option<ApiHistoryFilter>) -> Result<Vec<ApiHistoryItem>, String> {
    let filter = filter.unwrap_or(ApiHistoryFilter { method: None, host: None, status: None, limit: Some(200) });
    let conn = open_db(&app_handle)?;
    let mut stmt = conn.prepare("SELECT id, method, url, host, status, status_code, duration_ms, request_json, response_json, created_at FROM api_request_history ORDER BY created_at DESC LIMIT ?1").map_err(|err| format!("prepare api history failed: {err}"))?;
    let rows = stmt.query_map(params![filter.limit.unwrap_or(200).min(1000) as i64], |row| Ok(ApiHistoryItem {
        id: row.get(0)?,
        method: row.get(1)?,
        url: row.get(2)?,
        host: row.get(3)?,
        status: row.get(4)?,
        status_code: row.get::<_, Option<i64>>(5)?.map(|value| value as u16),
        duration_ms: row.get::<_, i64>(6)? as u64,
        request_json: row.get(7)?,
        response_json: row.get(8)?,
        created_at: row.get(9)?,
    })).map_err(|err| format!("query api history failed: {err}"))?;
    let mut items = Vec::new();
    for row in rows {
        let item = row.map_err(|err| format!("read api history failed: {err}"))?;
        if let Some(method) = &filter.method { if !method.is_empty() && item.method != method.to_uppercase() { continue; } }
        if let Some(host) = &filter.host { if !host.is_empty() && !item.host.contains(host) { continue; } }
        if let Some(status) = &filter.status { if !status.is_empty() && item.status != *status { continue; } }
        items.push(item);
    }
    Ok(items)
}

#[tauri::command]
pub fn cmd_api_delete_history(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = open_db(&app_handle)?;
    conn.execute("DELETE FROM api_request_history WHERE id = ?1", params![id]).map_err(|err| format!("delete api history failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub fn cmd_api_clear_history(app_handle: tauri::AppHandle) -> Result<(), String> {
    let conn = open_db(&app_handle)?;
    conn.execute("DELETE FROM api_request_history", []).map_err(|err| format!("clear api history failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub fn cmd_api_import_curl(curl: String) -> Result<ApiSendRequest, String> {
    let mut method = "GET".to_string();
    let mut headers = Vec::new();
    let mut cookies = Vec::new();
    let mut params = Vec::new();
    let mut body: Option<ApiBodyConfig> = None;
    let mut url = String::new();
    let mut auth: Option<ApiAuthConfig> = None;
    let mut timeout_ms = Some(DEFAULT_TIMEOUT_MS);
    let mut follow_redirects = Some(false);
    let mut validate_ssl = Some(true);
    let mut use_get_with_data = false;
    let tokens = shell_words(&curl);
    let mut iter = tokens.into_iter().peekable();
    while let Some(token) = iter.next() {
        let (flag, inline_value) = split_curl_assignment(&token);
        match flag.as_str() {
            "curl" => {}
            "-X" | "--request" => if let Some(value) = inline_value.or_else(|| iter.next()) { method = value.to_uppercase(); },
            "--url" => if let Some(value) = inline_value.or_else(|| iter.next()) { url = value; },
            "-G" | "--get" => {
                use_get_with_data = true;
                method = "GET".to_string();
            }
            "-I" | "--head" => method = "HEAD".to_string(),
            "-L" | "--location" => follow_redirects = Some(true),
            "-k" | "--insecure" => validate_ssl = Some(false),
            "--max-time" | "--connect-timeout" => if let Some(value) = inline_value.or_else(|| iter.next()) {
                if let Ok(seconds) = value.parse::<f64>() {
                    timeout_ms = Some((seconds * 1000.0).round().clamp(500.0, 300_000.0) as u64);
                }
            },
            "-A" | "--user-agent" => if let Some(value) = inline_value.or_else(|| iter.next()) {
                headers.push(api_pair("User-Agent", &value, false));
            },
            "-u" | "--user" => if let Some(value) = inline_value.or_else(|| iter.next()) {
                let (username, password) = value.split_once(':').unwrap_or((&value, ""));
                auth = Some(ApiAuthConfig {
                    auth_type: "basic".to_string(),
                    username: Some(username.to_string()),
                    password: Some(password.to_string()),
                    token: None,
                    key: None,
                    value: None,
                    add_to: None,
                });
            },
            "-b" | "--cookie" => if let Some(value) = inline_value.or_else(|| iter.next()) {
                let parsed = parse_cookie_pairs(&value);
                if parsed.is_empty() {
                    headers.push(api_pair("Cookie", &value, true));
                } else {
                    cookies.extend(parsed);
                }
            },
            "-H" | "--header" => if let Some(value) = inline_value.or_else(|| iter.next()) {
                if let Some((key, val)) = value.split_once(':') {
                    headers.push(api_pair(key.trim(), val.trim(), is_sensitive_key(key)));
                }
            },
            "-d" | "--data" | "--data-raw" | "--data-binary" | "--data-ascii" | "--data-urlencode" => if let Some(value) = inline_value.or_else(|| iter.next()) {
                if use_get_with_data {
                    params.extend(parse_query_pairs(&value));
                } else {
                    if method == "GET" { method = "POST".to_string(); }
                    body = Some(raw_body_from_curl_data(value, &headers));
                }
            },
            "-F" | "--form" | "--form-string" => if let Some(value) = inline_value.or_else(|| iter.next()) {
                if method == "GET" { method = "POST".to_string(); }
                push_form_body(&mut body, value);
            },
            "--compressed" | "-s" | "--silent" | "-S" | "--show-error" | "-i" | "--include" => {}
            value if value.starts_with("-X") && value.len() > 2 => method = value[2..].to_uppercase(),
            value if value.starts_with("-H") && value.len() > 2 => {
                let header = &value[2..];
                if let Some((key, val)) = header.split_once(':') {
                    headers.push(api_pair(key.trim(), val.trim(), is_sensitive_key(key)));
                }
            }
            value if value.starts_with("-d") && value.len() > 2 => {
                let data = value[2..].to_string();
                if use_get_with_data {
                    params.extend(parse_query_pairs(&data));
                } else {
                    if method == "GET" { method = "POST".to_string(); }
                    body = Some(raw_body_from_curl_data(data, &headers));
                }
            }
            value if value.starts_with("http://") || value.starts_with("https://") => url = value.to_string(),
            _ => {}
        }
    }
    if url.is_empty() {
        return Err("cURL import failed: URL is required".to_string());
    }
    Ok(ApiSendRequest { request_id: None, method, url, params, headers, cookies, auth, body, timeout_ms, follow_redirects, validate_ssl, environment_id: None, save_history: Some(true) })
}

fn api_pair(key: &str, value: &str, secret: bool) -> ApiKeyValue {
    ApiKeyValue {
        key: key.to_string(),
        value: value.to_string(),
        enabled: true,
        secret: Some(secret),
    }
}

fn split_curl_assignment(token: &str) -> (String, Option<String>) {
    if let Some((flag, value)) = token.split_once('=') {
        if flag.starts_with("--") {
            return (flag.to_string(), Some(value.to_string()));
        }
    }
    (token.to_string(), None)
}

fn parse_cookie_pairs(value: &str) -> Vec<ApiKeyValue> {
    value
        .split(';')
        .filter_map(|item| {
            let (key, val) = item.trim().split_once('=')?;
            Some(api_pair(key.trim(), val.trim(), true))
        })
        .collect()
}

fn parse_query_pairs(value: &str) -> Vec<ApiKeyValue> {
    value
        .split('&')
        .filter_map(|item| {
            let (key, val) = item.trim().split_once('=')?;
            Some(api_pair(key.trim(), val.trim(), is_sensitive_key(key)))
        })
        .collect()
}

fn raw_body_from_curl_data(value: String, headers: &[ApiKeyValue]) -> ApiBodyConfig {
    let content_type = headers
        .iter()
        .find(|header| header.key.eq_ignore_ascii_case("content-type"))
        .map(|header| header.value.clone());
    let body_type = content_type
        .as_deref()
        .map(|content_type| {
            if content_type.contains("json") {
                "json"
            } else if content_type.contains("xml") {
                "xml"
            } else {
                "raw"
            }
        })
        .unwrap_or("raw")
        .to_string();
    ApiBodyConfig {
        body_type,
        raw: Some(value),
        form: None,
        multipart: None,
        binary_path: None,
        content_type,
    }
}

fn push_form_body(body: &mut Option<ApiBodyConfig>, value: String) {
    let (key, val) = value.split_once('=').unwrap_or((value.as_str(), ""));
    let mut items = body
        .as_ref()
        .and_then(|body| body.multipart.clone())
        .unwrap_or_default();
    items.push(api_pair(key.trim(), val.trim(), false));
    *body = Some(ApiBodyConfig {
        body_type: "multipart".to_string(),
        raw: None,
        form: None,
        multipart: Some(items),
        binary_path: None,
        content_type: Some("multipart/form-data".to_string()),
    });
}

#[tauri::command]
pub fn cmd_api_export_collection_json(app_handle: tauri::AppHandle, collection_id: String, redact: Option<bool>) -> Result<String, String> {
    let collections = cmd_api_list_collections(app_handle.clone())?.into_iter().filter(|item| item.id == collection_id).collect::<Vec<_>>();
    let folders = cmd_api_list_folders(app_handle.clone(), Some(collection_id.clone()))?;
    let requests = cmd_api_list_requests(app_handle, Some(collection_id))?;
    Ok(serde_json::to_string_pretty(&serde_json::json!({ "format": "devnexus-api-collection-v1", "redacted": redact.unwrap_or(true), "collections": collections, "folders": folders, "requests": requests })).unwrap_or_default())
}

fn shell_words(input: &str) -> Vec<String> {
    let mut words = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut chars = input.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            '\'' | '"' if quote == Some(ch) => quote = None,
            '\'' | '"' if quote.is_none() => quote = Some(ch),
            '\\' => if let Some(next) = chars.next() { current.push(next); },
            ch if ch.is_whitespace() && quote.is_none() => {
                if !current.is_empty() {
                    words.push(current.clone());
                    current.clear();
                }
            }
            _ => current.push(ch),
        }
    }
    if !current.is_empty() {
        words.push(current);
    }
    words
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masks_sensitive_values() {
        let items = vec![ApiKeyValue { key: "Authorization".to_string(), value: "Bearer abc".to_string(), enabled: true, secret: None }];
        assert_eq!(mask_items(&items)[0].value, "***");
    }

    #[test]
    fn parses_basic_curl() {
        let request = cmd_api_import_curl("curl -X POST -H 'Authorization: Bearer abc' -d '{\"ok\":true}' https://example.com".to_string()).unwrap();
        assert_eq!(request.method, "POST");
        assert_eq!(request.headers.len(), 1);
        assert_eq!(request.url, "https://example.com");
    }

    #[test]
    fn parses_browser_style_curl_options() {
        let request = cmd_api_import_curl(
            "curl --url=https://example.com/search -G --data-urlencode 'q=devnexus' -u root:secret -b 'sid=abc; theme=dark' -L -k --max-time 3".to_string(),
        ).unwrap();

        assert_eq!(request.method, "GET");
        assert_eq!(request.url, "https://example.com/search");
        assert_eq!(request.params[0].key, "q");
        assert_eq!(request.params[0].value, "devnexus");
        assert_eq!(request.cookies.len(), 2);
        assert_eq!(request.auth.unwrap().auth_type, "basic");
        assert_eq!(request.follow_redirects, Some(true));
        assert_eq!(request.validate_ssl, Some(false));
        assert_eq!(request.timeout_ms, Some(3000));
    }

    #[test]
    fn parses_multipart_curl() {
        let request = cmd_api_import_curl("curl -F 'name=devnexus' -F 'file=@README.md' https://example.com/upload".to_string()).unwrap();

        assert_eq!(request.method, "POST");
        let body = request.body.unwrap();
        assert_eq!(body.body_type, "multipart");
        assert_eq!(body.multipart.unwrap().len(), 2);
    }
}
