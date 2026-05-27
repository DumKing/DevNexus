use crate::db::s3_connection_repo::{self, S3ConnectionForm, S3ConnectionInfo};
use std::collections::HashMap;
use std::time::Duration;

use aws_sdk_s3::presigning::PresigningConfig;
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::types::{
    BucketLocationConstraint, BucketVersioningStatus, CreateBucketConfiguration, Delete,
    ObjectIdentifier, VersioningConfiguration,
};

use super::types::S3Latency;

#[tauri::command]
pub fn cmd_s3_list_connections(
    app_handle: tauri::AppHandle,
) -> Result<Vec<S3ConnectionInfo>, String> {
    s3_connection_repo::list_s3_connections(&app_handle)
}

#[tauri::command]
pub fn cmd_s3_save_connection(
    app_handle: tauri::AppHandle,
    form: S3ConnectionForm,
) -> Result<String, String> {
    s3_connection_repo::save_s3_connection(&app_handle, form)
}

#[tauri::command]
pub fn cmd_s3_delete_connection(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    super::client_pool::remove_client(&id)?;
    s3_connection_repo::delete_s3_connection(&app_handle, &id)
}

#[tauri::command]
pub async fn cmd_s3_test_connection(form: S3ConnectionForm) -> Result<S3Latency, String> {
    if form.name.trim().is_empty() {
        return Err("name is required".to_string());
    }
    if form.access_key_id.trim().is_empty() {
        return Err("accessKeyId is required".to_string());
    }
    let secret = form.secret_access_key.clone().unwrap_or_default();
    if secret.trim().is_empty() {
        return Err("secretAccessKey is required".to_string());
    }
    if form.region.trim().is_empty() {
        return Err("region is required".to_string());
    }
    if form.provider == "custom" {
        let endpoint = form.endpoint.clone().unwrap_or_default();
        if endpoint.trim().is_empty() {
            return Err("endpoint is required for custom provider".to_string());
        }
    }

    let info = S3ConnectionInfo {
        id: form.id.clone().unwrap_or_else(|| "temp".to_string()),
        name: form.name.clone(),
        group_name: form.group_name.clone(),
        provider: form.provider.clone(),
        endpoint: form.endpoint.clone(),
        region: form.region.clone(),
        access_key_id: form.access_key_id.clone(),
        path_style: form.path_style.unwrap_or(false),
        default_bucket: form.default_bucket.clone(),
        created_at: String::new(),
    };

    let manual_buckets = parse_manual_bucket_names(form.default_bucket.as_deref());
    let started = std::time::Instant::now();
    let client = super::client_pool::build_client(&info, &secret).await?;
    if let Some(bucket) = manual_buckets.first() {
        client
            .list_objects_v2()
            .bucket(bucket)
            .max_keys(1)
            .send()
            .await
            .map_err(|err| format!("access manual bucket `{bucket}` failed: {err}"))?;
    } else {
        client
            .list_buckets()
            .send()
            .await
            .map_err(|err| format!("list buckets failed: {err}"))?;
    }
    Ok(S3Latency {
        millis: started.elapsed().as_millis() as u64,
    })
}

#[tauri::command]
pub async fn cmd_s3_connect(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    let info = s3_connection_repo::get_s3_connection(&app_handle, &id)?
        .ok_or_else(|| format!("s3 connection `{id}` not found"))?;
    let secret = s3_connection_repo::get_s3_secret_access_key(&app_handle, &id)?
        .ok_or_else(|| "secretAccessKey not found".to_string())?;
    let client = super::client_pool::build_client(&info, &secret).await?;
    super::client_pool::put_client(&id, client)
}

#[tauri::command]
pub fn cmd_s3_disconnect(id: String) -> Result<(), String> {
    super::client_pool::remove_client(&id)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct S3BucketInfo {
    pub name: String,
    pub creation_date: Option<String>,
    pub region: Option<String>,
    pub versioning_status: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct S3ObjectItem {
    pub key: String,
    pub size: i64,
    pub last_modified: Option<String>,
    pub etag: Option<String>,
    pub storage_class: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct S3ObjectVersion {
    pub key: String,
    pub version_id: Option<String>,
    pub is_latest: bool,
    pub last_modified: Option<String>,
    pub size: i64,
    pub etag: Option<String>,
    pub storage_class: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct S3ObjectMeta {
    pub key: String,
    pub content_type: Option<String>,
    pub content_length: i64,
    pub last_modified: Option<String>,
    pub etag: Option<String>,
    pub metadata: HashMap<String, String>,
    pub version_id: Option<String>,
    pub storage_class: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct S3DeleteObjectsResult {
    pub deleted_count: usize,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct S3ObjectTag {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct S3BucketStats {
    pub object_count: u64,
    pub total_size: i64,
    pub storage_class_breakdown: HashMap<String, u64>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct S3ListObjectsResult {
    pub objects: Vec<S3ObjectItem>,
    pub common_prefixes: Vec<String>,
    pub next_token: Option<String>,
    pub is_truncated: bool,
}

fn parse_manual_bucket_names(value: Option<&str>) -> Vec<String> {
    let Some(value) = value else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for item in value.split([',', '\n', '\r', ';']) {
        let name = item.trim();
        if name.is_empty() || out.iter().any(|existing| existing == name) {
            continue;
        }
        out.push(name.to_string());
    }
    out
}

fn manual_bucket_infos(value: Option<&str>) -> Vec<S3BucketInfo> {
    parse_manual_bucket_names(value)
        .into_iter()
        .map(|name| S3BucketInfo {
            name,
            creation_date: None,
            region: None,
            versioning_status: None,
        })
        .collect()
}

#[tauri::command]
pub async fn cmd_s3_list_buckets(
    app_handle: tauri::AppHandle,
    conn_id: String,
) -> Result<Vec<S3BucketInfo>, String> {
    let client = super::client_pool::get_client(&conn_id)?;
    let info = s3_connection_repo::get_s3_connection(&app_handle, &conn_id)?
        .ok_or_else(|| format!("s3 connection `{conn_id}` not found"))?;
    let manual_buckets = manual_bucket_infos(info.default_bucket.as_deref());
    let resp = match client.list_buckets().send().await {
        Ok(resp) => resp,
        Err(err) => {
            if manual_buckets.is_empty() {
                return Err(format!(
                    "list buckets failed: {err}. If this account only has access to specific buckets, edit the connection and set Manual Buckets."
                ));
            }
            return Ok(manual_buckets);
        }
    };
    let mut out = Vec::new();
    if let Some(items) = resp.buckets {
        for item in items {
            let name = item.name.unwrap_or_default();
            if name.trim().is_empty() {
                continue;
            }
            out.push(S3BucketInfo {
                name,
                creation_date: item.creation_date.map(|v| v.to_string()),
                region: None,
                versioning_status: None,
            });
        }
    }
    if out.is_empty() && !manual_buckets.is_empty() {
        return Ok(manual_buckets);
    }
    Ok(out)
}

#[tauri::command]
pub async fn cmd_s3_get_bucket_location(conn_id: String, bucket: String) -> Result<String, String> {
    if bucket.trim().is_empty() {
        return Err("bucket is required".to_string());
    }
    let client = super::client_pool::get_client(&conn_id)?;
    let resp = client
        .get_bucket_location()
        .bucket(bucket.trim().to_string())
        .send()
        .await
        .map_err(|err| format!("get bucket location failed: {err}"))?;
    Ok(resp
        .location_constraint
        .map(|value| value.as_str().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "us-east-1".to_string()))
}

#[tauri::command]
pub async fn cmd_s3_get_bucket_versioning(
    conn_id: String,
    bucket: String,
) -> Result<String, String> {
    if bucket.trim().is_empty() {
        return Err("bucket is required".to_string());
    }
    let client = super::client_pool::get_client(&conn_id)?;
    let resp = client
        .get_bucket_versioning()
        .bucket(bucket.trim().to_string())
        .send()
        .await
        .map_err(|err| format!("get bucket versioning failed: {err}"))?;
    Ok(resp
        .status
        .map(|value| value.as_str().to_string())
        .unwrap_or_else(|| "Disabled".to_string()))
}

#[tauri::command]
pub async fn cmd_s3_set_bucket_versioning(
    conn_id: String,
    bucket: String,
    enabled: bool,
) -> Result<(), String> {
    if bucket.trim().is_empty() {
        return Err("bucket is required".to_string());
    }
    let client = super::client_pool::get_client(&conn_id)?;
    let status = if enabled {
        BucketVersioningStatus::Enabled
    } else {
        BucketVersioningStatus::Suspended
    };
    let conf = VersioningConfiguration::builder().status(status).build();
    client
        .put_bucket_versioning()
        .bucket(bucket.trim().to_string())
        .versioning_configuration(conf)
        .send()
        .await
        .map_err(|err| format!("set bucket versioning failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub async fn cmd_s3_create_bucket(
    app_handle: tauri::AppHandle,
    conn_id: String,
    name: String,
    region: Option<String>,
) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("bucket name is required".to_string());
    }
    let info = s3_connection_repo::get_s3_connection(&app_handle, &conn_id)?
        .ok_or_else(|| format!("s3 connection `{conn_id}` not found"))?;
    let bucket_region = region.unwrap_or_else(|| info.region.clone());
    let client = super::client_pool::get_client(&conn_id)?;

    let mut req = client.create_bucket().bucket(name.trim().to_string());
    let is_aws_like = matches!(info.provider.as_str(), "aws" | "aliyun" | "tencent" | "r2");
    if is_aws_like && bucket_region != "us-east-1" {
        let conf = CreateBucketConfiguration::builder()
            .location_constraint(BucketLocationConstraint::from(bucket_region.as_str()))
            .build();
        req = req.create_bucket_configuration(conf);
    }
    req.send()
        .await
        .map_err(|err| format!("create bucket failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub async fn cmd_s3_delete_bucket(conn_id: String, name: String) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("bucket name is required".to_string());
    }
    let client = super::client_pool::get_client(&conn_id)?;
    client
        .delete_bucket()
        .bucket(name.trim().to_string())
        .send()
        .await
        .map_err(|err| format!("delete bucket failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub async fn cmd_s3_list_objects(
    conn_id: String,
    bucket: String,
    prefix: Option<String>,
    continuation_token: Option<String>,
    max_keys: Option<i32>,
) -> Result<S3ListObjectsResult, String> {
    if bucket.trim().is_empty() {
        return Err("bucket is required".to_string());
    }
    let client = super::client_pool::get_client(&conn_id)?;
    let mut req = client
        .list_objects_v2()
        .bucket(bucket.trim().to_string())
        .delimiter("/")
        .max_keys(max_keys.unwrap_or(200).max(1));
    if let Some(p) = prefix {
        let trimmed = p.trim().to_string();
        if !trimmed.is_empty() {
            req = req.prefix(trimmed);
        }
    }
    if let Some(token) = continuation_token {
        let trimmed = token.trim().to_string();
        if !trimmed.is_empty() {
            req = req.continuation_token(trimmed);
        }
    }

    let resp = req
        .send()
        .await
        .map_err(|err| format!("list objects failed: {err}"))?;

    let mut objects = Vec::new();
    if let Some(contents) = resp.contents {
        for item in contents {
            let key = item.key.unwrap_or_default();
            if key.is_empty() {
                continue;
            }
            objects.push(S3ObjectItem {
                key,
                size: item.size.unwrap_or(0),
                last_modified: item.last_modified.map(|v| v.to_string()),
                etag: item.e_tag,
                storage_class: item.storage_class.map(|v| v.as_str().to_string()),
            });
        }
    }

    let mut prefixes = Vec::new();
    if let Some(common_prefixes) = resp.common_prefixes {
        for item in common_prefixes {
            if let Some(prefix) = item.prefix {
                if !prefix.is_empty() {
                    prefixes.push(prefix);
                }
            }
        }
    }

    Ok(S3ListObjectsResult {
        objects,
        common_prefixes: prefixes,
        next_token: resp.next_continuation_token,
        is_truncated: resp.is_truncated.unwrap_or(false),
    })
}

#[tauri::command]
pub async fn cmd_s3_delete_object(
    conn_id: String,
    bucket: String,
    key: String,
    version_id: Option<String>,
) -> Result<(), String> {
    if bucket.trim().is_empty() || key.trim().is_empty() {
        return Err("bucket and key are required".to_string());
    }
    let client = super::client_pool::get_client(&conn_id)?;
    let mut req = client
        .delete_object()
        .bucket(bucket.trim().to_string())
        .key(key.trim().to_string());
    if let Some(v) = version_id {
        let trimmed = v.trim().to_string();
        if !trimmed.is_empty() {
            req = req.version_id(trimmed);
        }
    }
    req.send()
        .await
        .map_err(|err| format!("delete object failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub async fn cmd_s3_head_object(
    conn_id: String,
    bucket: String,
    key: String,
    version_id: Option<String>,
) -> Result<S3ObjectMeta, String> {
    if bucket.trim().is_empty() || key.trim().is_empty() {
        return Err("bucket and key are required".to_string());
    }
    let client = super::client_pool::get_client(&conn_id)?;
    let mut req = client
        .head_object()
        .bucket(bucket.trim().to_string())
        .key(key.trim().to_string());
    if let Some(version) = version_id {
        if !version.trim().is_empty() {
            req = req.version_id(version);
        }
    }
    let resp = req
        .send()
        .await
        .map_err(|err| format!("head object failed: {err}"))?;
    Ok(S3ObjectMeta {
        key,
        content_type: resp.content_type,
        content_length: resp.content_length.unwrap_or(0),
        last_modified: resp.last_modified.map(|value| value.to_string()),
        etag: resp.e_tag,
        metadata: resp.metadata.unwrap_or_default(),
        version_id: resp.version_id,
        storage_class: resp.storage_class.map(|value| value.as_str().to_string()),
    })
}

#[tauri::command]
pub async fn cmd_s3_delete_objects(
    conn_id: String,
    bucket: String,
    keys: Vec<String>,
) -> Result<S3DeleteObjectsResult, String> {
    if bucket.trim().is_empty() {
        return Err("bucket is required".to_string());
    }
    if keys.is_empty() {
        return Ok(S3DeleteObjectsResult {
            deleted_count: 0,
            errors: Vec::new(),
        });
    }
    let client = super::client_pool::get_client(&conn_id)?;
    let mut objects = Vec::new();
    for key in keys
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        objects.push(
            ObjectIdentifier::builder()
                .key(key.to_string())
                .build()
                .map_err(|err| format!("build delete object failed: {err}"))?,
        );
    }
    let delete = Delete::builder()
        .set_objects(Some(objects))
        .quiet(false)
        .build()
        .map_err(|err| format!("build delete request failed: {err}"))?;
    let resp = client
        .delete_objects()
        .bucket(bucket.trim().to_string())
        .delete(delete)
        .send()
        .await
        .map_err(|err| format!("delete objects failed: {err}"))?;
    let deleted_count = resp.deleted.unwrap_or_default().len();
    let errors = resp
        .errors
        .unwrap_or_default()
        .into_iter()
        .map(|err| {
            format!(
                "{}: {}",
                err.key.unwrap_or_else(|| "(unknown)".to_string()),
                err.message.unwrap_or_else(|| "delete failed".to_string())
            )
        })
        .collect();
    Ok(S3DeleteObjectsResult {
        deleted_count,
        errors,
    })
}

#[tauri::command]
pub async fn cmd_s3_delete_folder(
    conn_id: String,
    bucket: String,
    prefix: String,
) -> Result<S3DeleteObjectsResult, String> {
    if bucket.trim().is_empty() || prefix.trim().is_empty() {
        return Err("bucket and prefix are required".to_string());
    }
    let mut token = None;
    let mut keys = Vec::new();
    loop {
        let result = cmd_s3_list_objects(
            conn_id.clone(),
            bucket.clone(),
            Some(prefix.clone()),
            token,
            Some(1000),
        )
        .await?;
        keys.extend(result.objects.into_iter().map(|item| item.key));
        token = result.next_token;
        if token.is_none() {
            break;
        }
    }
    cmd_s3_delete_objects(conn_id, bucket, keys).await
}

#[tauri::command]
pub async fn cmd_s3_copy_object(
    conn_id: String,
    src_bucket: String,
    src_key: String,
    dst_bucket: String,
    dst_key: String,
) -> Result<(), String> {
    if src_bucket.trim().is_empty()
        || src_key.trim().is_empty()
        || dst_bucket.trim().is_empty()
        || dst_key.trim().is_empty()
    {
        return Err("source and destination are required".to_string());
    }
    let client = super::client_pool::get_client(&conn_id)?;
    let copy_source = format!(
        "{}/{}",
        src_bucket.trim(),
        urlencoding::encode(src_key.trim())
    );
    client
        .copy_object()
        .copy_source(copy_source)
        .bucket(dst_bucket.trim().to_string())
        .key(dst_key.trim().to_string())
        .send()
        .await
        .map_err(|err| format!("copy object failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub async fn cmd_s3_move_object(
    conn_id: String,
    src_bucket: String,
    src_key: String,
    dst_bucket: String,
    dst_key: String,
) -> Result<(), String> {
    cmd_s3_copy_object(
        conn_id.clone(),
        src_bucket.clone(),
        src_key.clone(),
        dst_bucket,
        dst_key,
    )
    .await?;
    cmd_s3_delete_object(conn_id, src_bucket, src_key, None).await
}

#[tauri::command]
pub async fn cmd_s3_rename_object(
    conn_id: String,
    bucket: String,
    old_key: String,
    new_key: String,
) -> Result<(), String> {
    cmd_s3_move_object(conn_id, bucket.clone(), old_key, bucket, new_key).await
}

#[tauri::command]
pub async fn cmd_s3_list_object_versions(
    conn_id: String,
    bucket: String,
    prefix: Option<String>,
) -> Result<Vec<S3ObjectVersion>, String> {
    if bucket.trim().is_empty() {
        return Err("bucket is required".to_string());
    }
    let client = super::client_pool::get_client(&conn_id)?;
    let mut req = client
        .list_object_versions()
        .bucket(bucket.trim().to_string());
    if let Some(prefix) = prefix {
        if !prefix.trim().is_empty() {
            req = req.prefix(prefix.trim().to_string());
        }
    }
    let resp = req
        .send()
        .await
        .map_err(|err| format!("list object versions failed: {err}"))?;
    let versions = resp
        .versions
        .unwrap_or_default()
        .into_iter()
        .filter_map(|item| {
            let key = item.key?;
            Some(S3ObjectVersion {
                key,
                version_id: item.version_id,
                is_latest: item.is_latest.unwrap_or(false),
                last_modified: item.last_modified.map(|value| value.to_string()),
                size: item.size.unwrap_or(0),
                etag: item.e_tag,
                storage_class: item.storage_class.map(|value| value.as_str().to_string()),
            })
        })
        .collect();
    Ok(versions)
}

#[tauri::command]
pub async fn cmd_s3_create_folder(
    conn_id: String,
    bucket: String,
    prefix: String,
) -> Result<(), String> {
    if bucket.trim().is_empty() || prefix.trim().is_empty() {
        return Err("bucket and prefix are required".to_string());
    }
    let key = if prefix.ends_with('/') {
        prefix
    } else {
        format!("{prefix}/")
    };
    let client = super::client_pool::get_client(&conn_id)?;
    client
        .put_object()
        .bucket(bucket.trim().to_string())
        .key(key)
        .body(aws_sdk_s3::primitives::ByteStream::from_static(b""))
        .send()
        .await
        .map_err(|err| format!("create folder failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub async fn cmd_s3_upload_file(
    conn_id: String,
    bucket: String,
    key: String,
    local_path: String,
    storage_class: Option<String>,
) -> Result<String, String> {
    if bucket.trim().is_empty() || key.trim().is_empty() || local_path.trim().is_empty() {
        return Err("bucket, key and localPath are required".to_string());
    }
    let transfer_id = uuid::Uuid::new_v4().to_string();
    let client = super::client_pool::get_client(&conn_id)?;
    let body = ByteStream::from_path(local_path.trim())
        .await
        .map_err(|err| format!("open local file failed: {err}"))?;
    let mut req = client
        .put_object()
        .bucket(bucket.trim().to_string())
        .key(key.trim().to_string())
        .body(body);
    if let Some(storage_class) = storage_class {
        if !storage_class.trim().is_empty() {
            req = req.storage_class(aws_sdk_s3::types::StorageClass::from(
                storage_class.as_str(),
            ));
        }
    }
    req.send()
        .await
        .map_err(|err| format!("upload file failed: {err}"))?;
    Ok(transfer_id)
}

#[tauri::command]
pub async fn cmd_s3_upload_folder(
    conn_id: String,
    bucket: String,
    prefix: String,
    local_dir: String,
) -> Result<String, String> {
    if local_dir.trim().is_empty() {
        return Err("localDir is required".to_string());
    }
    let batch_id = uuid::Uuid::new_v4().to_string();
    let root = std::path::PathBuf::from(local_dir.trim());
    let mut stack = vec![root.clone()];
    while let Some(path) = stack.pop() {
        let entries = std::fs::read_dir(&path).map_err(|err| format!("read dir failed: {err}"))?;
        for entry in entries {
            let entry = entry.map_err(|err| format!("read dir entry failed: {err}"))?;
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            let relative = path
                .strip_prefix(&root)
                .map_err(|err| format!("strip prefix failed: {err}"))?
                .to_string_lossy()
                .replace('\\', "/");
            let key = if prefix.trim().is_empty() {
                relative
            } else {
                format!(
                    "{}{}",
                    prefix.trim().trim_end_matches('/'),
                    format!("/{relative}")
                )
            };
            cmd_s3_upload_file(
                conn_id.clone(),
                bucket.clone(),
                key,
                path.to_string_lossy().to_string(),
                None,
            )
            .await?;
        }
    }
    Ok(batch_id)
}

#[tauri::command]
pub fn cmd_s3_cancel_upload(_transfer_id: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn cmd_s3_download_object(
    conn_id: String,
    bucket: String,
    key: String,
    local_path: String,
    version_id: Option<String>,
) -> Result<String, String> {
    if bucket.trim().is_empty() || key.trim().is_empty() || local_path.trim().is_empty() {
        return Err("bucket, key and localPath are required".to_string());
    }
    let transfer_id = uuid::Uuid::new_v4().to_string();
    let client = super::client_pool::get_client(&conn_id)?;
    let mut req = client
        .get_object()
        .bucket(bucket.trim().to_string())
        .key(key.trim().to_string());
    if let Some(version) = version_id {
        if !version.trim().is_empty() {
            req = req.version_id(version);
        }
    }
    let resp = req
        .send()
        .await
        .map_err(|err| format!("download object failed: {err}"))?;
    let bytes = resp
        .body
        .collect()
        .await
        .map_err(|err| format!("read object stream failed: {err}"))?
        .into_bytes();
    if let Some(parent) = std::path::Path::new(local_path.trim()).parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|err| format!("create dir failed: {err}"))?;
        }
    }
    tokio::fs::write(local_path.trim(), bytes)
        .await
        .map_err(|err| format!("write local file failed: {err}"))?;
    Ok(transfer_id)
}

#[tauri::command]
pub async fn cmd_s3_download_objects(
    conn_id: String,
    bucket: String,
    keys: Vec<String>,
    local_dir: String,
) -> Result<String, String> {
    if local_dir.trim().is_empty() {
        return Err("localDir is required".to_string());
    }
    let batch_id = uuid::Uuid::new_v4().to_string();
    for key in keys {
        let path = std::path::Path::new(local_dir.trim())
            .join(key.replace('/', std::path::MAIN_SEPARATOR_STR));
        cmd_s3_download_object(
            conn_id.clone(),
            bucket.clone(),
            key,
            path.to_string_lossy().to_string(),
            None,
        )
        .await?;
    }
    Ok(batch_id)
}

#[tauri::command]
pub async fn cmd_s3_download_folder(
    conn_id: String,
    bucket: String,
    prefix: String,
    local_dir: String,
) -> Result<String, String> {
    let mut token = None;
    let mut keys = Vec::new();
    loop {
        let result = cmd_s3_list_objects(
            conn_id.clone(),
            bucket.clone(),
            Some(prefix.clone()),
            token,
            Some(1000),
        )
        .await?;
        keys.extend(result.objects.into_iter().map(|item| item.key));
        token = result.next_token;
        if token.is_none() {
            break;
        }
    }
    cmd_s3_download_objects(conn_id, bucket, keys, local_dir).await
}

#[tauri::command]
pub fn cmd_s3_cancel_download(_transfer_id: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn cmd_s3_get_object_text(
    conn_id: String,
    bucket: String,
    key: String,
    version_id: Option<String>,
) -> Result<String, String> {
    let bytes = cmd_s3_get_object_bytes(conn_id, bucket, key, version_id).await?;
    if bytes.len() > 2 * 1024 * 1024 {
        return Err("object is larger than 2MB text preview limit".to_string());
    }
    String::from_utf8(bytes).map_err(|err| format!("object is not valid utf-8: {err}"))
}

#[tauri::command]
pub async fn cmd_s3_get_object_bytes(
    conn_id: String,
    bucket: String,
    key: String,
    version_id: Option<String>,
) -> Result<Vec<u8>, String> {
    if bucket.trim().is_empty() || key.trim().is_empty() {
        return Err("bucket and key are required".to_string());
    }
    let client = super::client_pool::get_client(&conn_id)?;
    let mut req = client
        .get_object()
        .bucket(bucket.trim().to_string())
        .key(key.trim().to_string());
    if let Some(version) = version_id {
        if !version.trim().is_empty() {
            req = req.version_id(version);
        }
    }
    let resp = req
        .send()
        .await
        .map_err(|err| format!("get object failed: {err}"))?;
    let bytes = resp
        .body
        .collect()
        .await
        .map_err(|err| format!("read object failed: {err}"))?
        .into_bytes()
        .to_vec();
    if bytes.len() > 10 * 1024 * 1024 {
        return Err("object is larger than 10MB binary preview limit".to_string());
    }
    Ok(bytes)
}

#[tauri::command]
pub async fn cmd_s3_generate_presigned_url(
    conn_id: String,
    bucket: String,
    key: String,
    expires_secs: u64,
    version_id: Option<String>,
) -> Result<String, String> {
    if bucket.trim().is_empty() || key.trim().is_empty() {
        return Err("bucket and key are required".to_string());
    }
    let expires = expires_secs.clamp(60, 7 * 24 * 60 * 60);
    let client = super::client_pool::get_client(&conn_id)?;
    let mut req = client
        .get_object()
        .bucket(bucket.trim().to_string())
        .key(key.trim().to_string());
    if let Some(version) = version_id {
        if !version.trim().is_empty() {
            req = req.version_id(version);
        }
    }
    let conf = PresigningConfig::expires_in(Duration::from_secs(expires))
        .map_err(|err| format!("build presign config failed: {err}"))?;
    let presigned = req
        .presigned(conf)
        .await
        .map_err(|err| format!("generate presigned url failed: {err}"))?;
    Ok(presigned.uri().to_string())
}

#[tauri::command]
pub async fn cmd_s3_get_bucket_policy(conn_id: String, bucket: String) -> Result<String, String> {
    if bucket.trim().is_empty() {
        return Err("bucket is required".to_string());
    }
    let client = super::client_pool::get_client(&conn_id)?;
    let resp = client
        .get_bucket_policy()
        .bucket(bucket.trim().to_string())
        .send()
        .await;
    match resp {
        Ok(value) => Ok(value.policy.unwrap_or_default()),
        Err(err) => {
            let text = err.to_string();
            if text.contains("NoSuchBucketPolicy") || text.contains("NoSuchBucket") {
                Ok(String::new())
            } else {
                Err(format!("get bucket policy failed: {err}"))
            }
        }
    }
}

#[tauri::command]
pub async fn cmd_s3_set_bucket_policy(
    conn_id: String,
    bucket: String,
    policy_json: String,
) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&policy_json)
        .map_err(|err| format!("invalid policy json: {err}"))?;
    let client = super::client_pool::get_client(&conn_id)?;
    client
        .put_bucket_policy()
        .bucket(bucket.trim().to_string())
        .policy(policy_json)
        .send()
        .await
        .map_err(|err| format!("set bucket policy failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub async fn cmd_s3_delete_bucket_policy(conn_id: String, bucket: String) -> Result<(), String> {
    let client = super::client_pool::get_client(&conn_id)?;
    client
        .delete_bucket_policy()
        .bucket(bucket.trim().to_string())
        .send()
        .await
        .map_err(|err| format!("delete bucket policy failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub async fn cmd_s3_get_object_tags(
    conn_id: String,
    bucket: String,
    key: String,
) -> Result<Vec<S3ObjectTag>, String> {
    let client = super::client_pool::get_client(&conn_id)?;
    let resp = client
        .get_object_tagging()
        .bucket(bucket.trim().to_string())
        .key(key.trim().to_string())
        .send()
        .await
        .map_err(|err| format!("get object tags failed: {err}"))?;
    Ok(resp
        .tag_set
        .into_iter()
        .map(|tag| S3ObjectTag {
            key: tag.key,
            value: tag.value,
        })
        .collect())
}

#[tauri::command]
pub async fn cmd_s3_set_object_tags(
    conn_id: String,
    bucket: String,
    key: String,
    tags: Vec<S3ObjectTag>,
) -> Result<(), String> {
    let client = super::client_pool::get_client(&conn_id)?;
    let tag_set = tags
        .into_iter()
        .filter(|tag| !tag.key.trim().is_empty())
        .map(|tag| {
            aws_sdk_s3::types::Tag::builder()
                .key(tag.key)
                .value(tag.value)
                .build()
                .map_err(|err| format!("build tag failed: {err}"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let tagging = aws_sdk_s3::types::Tagging::builder()
        .set_tag_set(Some(tag_set))
        .build()
        .map_err(|err| format!("build tagging failed: {err}"))?;
    client
        .put_object_tagging()
        .bucket(bucket.trim().to_string())
        .key(key.trim().to_string())
        .tagging(tagging)
        .send()
        .await
        .map_err(|err| format!("set object tags failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub async fn cmd_s3_delete_object_tags(
    conn_id: String,
    bucket: String,
    key: String,
) -> Result<(), String> {
    let client = super::client_pool::get_client(&conn_id)?;
    client
        .delete_object_tagging()
        .bucket(bucket.trim().to_string())
        .key(key.trim().to_string())
        .send()
        .await
        .map_err(|err| format!("delete object tags failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub async fn cmd_s3_get_bucket_stats(
    conn_id: String,
    bucket: String,
    prefix: Option<String>,
) -> Result<S3BucketStats, String> {
    let mut token = None;
    let mut object_count = 0;
    let mut total_size = 0;
    let mut storage_class_breakdown: HashMap<String, u64> = HashMap::new();
    loop {
        let result = cmd_s3_list_objects(
            conn_id.clone(),
            bucket.clone(),
            prefix.clone(),
            token,
            Some(1000),
        )
        .await?;
        for object in result.objects {
            object_count += 1;
            total_size += object.size;
            let class = object
                .storage_class
                .unwrap_or_else(|| "STANDARD".to_string());
            *storage_class_breakdown.entry(class).or_insert(0) += 1;
        }
        token = result.next_token;
        if token.is_none() {
            break;
        }
    }
    Ok(S3BucketStats {
        object_count,
        total_size,
        storage_class_breakdown,
    })
}

#[cfg(test)]
mod tests {
    use super::parse_manual_bucket_names;

    #[test]
    fn parses_manual_bucket_names_from_commas_newlines_and_semicolons() {
        let buckets = parse_manual_bucket_names(Some(" alpha, beta\n gamma;alpha ;  "));

        assert_eq!(buckets, vec!["alpha", "beta", "gamma"]);
    }
}
