use std::collections::HashMap;
use std::future::Future;
use std::io::{Read, Write};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use base64::Engine;
use russh::keys::ssh_key;
use russh::{client, ChannelMsg, Disconnect};
use tauri::Emitter;
use tokio::sync::mpsc::{self, UnboundedSender};

use super::types::SshTerminalSessionInfo;

struct TerminalSession {
    pub session_id: String,
    pub conn_id: String,
    pub app_handle: tauri::AppHandle,
    pub stdin: Arc<Mutex<ChildStdin>>,
    pub child: Arc<Mutex<Child>>,
    pub runtime_key_path: Option<PathBuf>,
    pub pending_output: Arc<Mutex<Vec<u8>>>,
}

struct TerminalLaunch {
    program: String,
    args: Vec<String>,
    runtime_key_path: Option<PathBuf>,
    auth_responses: Vec<String>,
}

enum NativeTerminalInput {
    Data(Vec<u8>),
    Resize(u16, u16),
    Close,
}

struct NativeTerminalSession {
    pub session_id: String,
    pub conn_id: String,
    pub app_handle: tauri::AppHandle,
    pub input_tx: UnboundedSender<NativeTerminalInput>,
    pub task: tauri::async_runtime::JoinHandle<()>,
    pub pending_output: Arc<Mutex<Vec<u8>>>,
}

struct PasswordResponder {
    responses: Vec<String>,
    next_response: usize,
    tail: String,
    last_write: Option<Instant>,
}

impl PasswordResponder {
    fn new(responses: Vec<String>) -> Self {
        Self {
            responses,
            next_response: 0,
            tail: String::new(),
            last_write: None,
        }
    }

    fn maybe_write_response(
        &mut self,
        chunk: &[u8],
        stdin: &Arc<Mutex<ChildStdin>>,
    ) -> Result<(), String> {
        if self.next_response >= self.responses.len() {
            return Ok(());
        }

        self.tail
            .push_str(&String::from_utf8_lossy(chunk).to_ascii_lowercase());
        if self.tail.len() > 512 {
            self.tail = self
                .tail
                .chars()
                .rev()
                .take(512)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect();
        }

        if !is_password_prompt(&self.tail) {
            return Ok(());
        }

        if self
            .last_write
            .is_some_and(|written_at| written_at.elapsed() < Duration::from_millis(800))
        {
            return Ok(());
        }

        let response = self.responses[self.next_response].clone();
        self.next_response += 1;
        self.last_write = Some(Instant::now());
        self.tail.clear();

        let mut writer = stdin
            .lock()
            .map_err(|_| "failed to lock terminal stdin for password response".to_string())?;
        writer
            .write_all(response.as_bytes())
            .map_err(|err| format!("write ssh password failed: {err}"))?;
        writer
            .write_all(b"\n")
            .map_err(|err| format!("write ssh password newline failed: {err}"))?;
        writer
            .flush()
            .map_err(|err| format!("flush ssh password failed: {err}"))?;
        Ok(())
    }
}

fn is_password_prompt(text: &str) -> bool {
    let normalized = text.to_ascii_lowercase();
    normalized.contains("password:") || normalized.contains("password for ")
}

fn pool() -> &'static Arc<Mutex<HashMap<String, TerminalSession>>> {
    static POOL: OnceLock<Arc<Mutex<HashMap<String, TerminalSession>>>> = OnceLock::new();
    POOL.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

fn native_pool() -> &'static Arc<Mutex<HashMap<String, NativeTerminalSession>>> {
    static POOL: OnceLock<Arc<Mutex<HashMap<String, NativeTerminalSession>>>> = OnceLock::new();
    POOL.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

fn event_output(session_id: &str) -> String {
    format!("ssh://terminal-output/{session_id}")
}

fn event_exit(session_id: &str) -> String {
    format!("ssh://terminal-exit/{session_id}")
}

fn emit_output(app_handle: &tauri::AppHandle, session_id: &str, data: &[u8]) {
    let output = base64::engine::general_purpose::STANDARD.encode(data);
    let _ = app_handle.emit(&event_output(session_id), output);
}

fn record_and_emit(
    app_handle: &tauri::AppHandle,
    session_id: &str,
    pending: &Arc<Mutex<Vec<u8>>>,
    data: &[u8],
) {
    if let Ok(mut p) = pending.lock() {
        p.extend_from_slice(data);
    }
    emit_output(app_handle, session_id, data);
}

#[derive(Clone)]
struct NativeClient {
    app_handle: tauri::AppHandle,
    session_id: String,
    pending_output: Arc<Mutex<Vec<u8>>>,
}

impl client::Handler for NativeClient {
    type Error = russh::Error;

    fn check_server_key(
        &mut self,
        _server_public_key: &ssh_key::PublicKey,
    ) -> impl Future<Output = Result<bool, Self::Error>> + Send {
        async { Ok(true) }
    }

    fn auth_banner(
        &mut self,
        banner: &str,
        _session: &mut client::Session,
    ) -> impl Future<Output = Result<(), Self::Error>> + Send {
        let app_handle = self.app_handle.clone();
        let session_id = self.session_id.clone();
        let pending_output = self.pending_output.clone();
        let banner = banner.as_bytes().to_vec();
        async move {
            record_and_emit(&app_handle, &session_id, &pending_output, &banner);
            Ok(())
        }
    }
}

fn prepare_runtime_key_file(
    app_handle: &tauri::AppHandle,
    source_key_path: &str,
) -> Result<PathBuf, String> {
    let source = Path::new(source_key_path);
    if !source.exists() {
        return Err(format!("ssh key file not found: {source_key_path}"));
    }
    let key_content =
        std::fs::read_to_string(source).map_err(|err| format!("read ssh key failed: {err}"))?;
    let runtime_dir = crate::db::init::data_dir(app_handle)?
        .join("ssh")
        .join("runtime-keys");
    std::fs::create_dir_all(&runtime_dir)
        .map_err(|err| format!("create runtime key dir failed: {err}"))?;
    let runtime_file = runtime_dir.join(format!("{}.pem", uuid::Uuid::new_v4()));
    std::fs::write(&runtime_file, key_content)
        .map_err(|err| format!("write runtime key file failed: {err}"))?;
    harden_runtime_key_permissions(&runtime_file)?;
    Ok(runtime_file)
}

fn harden_runtime_key_permissions(path: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        let path_str = path.to_string_lossy().to_string();
        let output0 = Command::new("icacls")
            .args([path_str.as_str(), "/reset"])
            .output()
            .map_err(|err| format!("run icacls reset failed: {err}"))?;
        if !output0.status.success() {
            return Err(format!(
                "reset key acl failed: {}",
                String::from_utf8_lossy(&output0.stderr)
            ));
        }
        let output1 = Command::new("icacls")
            .args([path_str.as_str(), "/inheritance:r"])
            .output()
            .map_err(|err| format!("run icacls inheritance failed: {err}"))?;
        if !output1.status.success() {
            return Err(format!(
                "set key inheritance failed: {}",
                String::from_utf8_lossy(&output1.stderr)
            ));
        }
        let whoami = Command::new("whoami")
            .output()
            .map_err(|err| format!("run whoami failed: {err}"))?;
        if !whoami.status.success() {
            return Err(format!(
                "resolve current user failed: {}",
                String::from_utf8_lossy(&whoami.stderr)
            ));
        }
        let username = String::from_utf8_lossy(&whoami.stdout).trim().to_string();
        if username.is_empty() {
            return Err("USERNAME not found for key permission hardening".to_string());
        }
        let grant_user = format!("{username}:(R)");
        let output2 = Command::new("icacls")
            .args([path_str.as_str(), "/grant:r", grant_user.as_str()])
            .output()
            .map_err(|err| format!("run icacls grant failed: {err}"))?;
        if !output2.status.success() {
            return Err(format!(
                "grant user permission failed: {}",
                String::from_utf8_lossy(&output2.stderr)
            ));
        }
        let output3 = Command::new("icacls")
            .args([
                path_str.as_str(),
                "/remove",
                "Everyone",
                "Users",
                "Authenticated Users",
                "BUILTIN\\Users",
                "BUILTIN\\Administrators",
                "NT AUTHORITY\\SYSTEM",
            ])
            .output()
            .map_err(|err| format!("run icacls remove failed: {err}"))?;
        if !output3.status.success() {
            // Keep non-fatal; some groups may not exist in localized systems.
        }
    }
    Ok(())
}

fn build_ssh_command(
    app_handle: &tauri::AppHandle,
    conn_id: &str,
) -> Result<TerminalLaunch, String> {
    let conn = crate::db::ssh_connection_repo::get_ssh_connection(app_handle, conn_id)?
        .ok_or_else(|| format!("ssh connection `{conn_id}` not found"))?;
    let (password, _passphrase) =
        crate::db::ssh_connection_repo::get_ssh_auth_secret(app_handle, conn_id)?;
    let mut runtime_key_path: Option<PathBuf> = None;
    let mut auth_responses: Vec<String> = Vec::new();

    let mut args = vec![
        "-tt".to_string(),
        "-o".to_string(),
        "LogLevel=ERROR".to_string(),
        "-o".to_string(),
        "StrictHostKeyChecking=accept-new".to_string(),
        "-o".to_string(),
        "UserKnownHostsFile=NUL".to_string(),
        "-o".to_string(),
        "ServerAliveInterval=30".to_string(),
        "-p".to_string(),
        conn.port.to_string(),
    ];

    if conn.auth_type == "key" || conn.auth_type == "key_password" {
        if let Some(key_id) = conn.key_id.clone() {
            if let Some(key_path) =
                crate::db::ssh_connection_repo::get_ssh_key_path(app_handle, &key_id)?
            {
                let runtime_key = prepare_runtime_key_file(app_handle, &key_path)?;
                args.push("-i".to_string());
                args.push(runtime_key.to_string_lossy().to_string());
                runtime_key_path = Some(runtime_key);
            } else {
                return Err("selected key not found".to_string());
            }
        } else {
            return Err("key auth selected but keyId is empty".to_string());
        }
    }

    if conn.auth_type == "password" {
        let password = password.unwrap_or_default();
        if password.is_empty() {
            return Err("password auth selected but password is empty".to_string());
        }
        args.push("-o".to_string());
        args.push("PreferredAuthentications=password".to_string());
        args.push("-o".to_string());
        args.push("PubkeyAuthentication=no".to_string());
        auth_responses.push(password);
    }

    if let Some(jump_host_id) = conn.jump_host_id.clone() {
        if let Some(jump) =
            crate::db::ssh_connection_repo::get_ssh_connection(app_handle, &jump_host_id)?
        {
            let (jump_password, _) =
                crate::db::ssh_connection_repo::get_ssh_auth_secret(app_handle, &jump_host_id)?;
            if jump.auth_type == "password" {
                let jump_password = jump_password.unwrap_or_default();
                if jump_password.is_empty() {
                    return Err(
                        "jump host password auth selected but password is empty".to_string()
                    );
                }
                auth_responses.insert(0, jump_password);
            }
            args.push("-J".to_string());
            args.push(format!("{}@{}:{}", jump.username, jump.host, jump.port));
        }
    }

    args.push(format!("{}@{}", conn.username, conn.host));

    Ok(TerminalLaunch {
        program: "ssh".to_string(),
        args,
        runtime_key_path,
        auth_responses,
    })
}

async fn run_native_password_terminal(
    app_handle: tauri::AppHandle,
    session_id: String,
    conn: crate::db::ssh_connection_repo::SshConnectionInfo,
    password: String,
    pending_output: Arc<Mutex<Vec<u8>>>,
    mut input_rx: mpsc::UnboundedReceiver<NativeTerminalInput>,
) -> Result<(), String> {
    let client = NativeClient {
        app_handle: app_handle.clone(),
        session_id: session_id.clone(),
        pending_output: pending_output.clone(),
    };
    let config = client::Config {
        inactivity_timeout: None,
        ..Default::default()
    };
    let mut handle = client::connect(
        Arc::new(config),
        (conn.host.trim().to_string(), conn.port),
        client,
    )
    .await
    .map_err(|err| format!("ssh connect failed: {err}"))?;

    let authenticated = handle
        .authenticate_password(conn.username.trim().to_string(), password)
        .await
        .map_err(|err| format!("ssh password auth failed: {err}"))?;
    if !authenticated.success() {
        return Err("ssh password auth failed: server rejected credentials".to_string());
    }

    let mut channel = handle
        .channel_open_session()
        .await
        .map_err(|err| format!("open ssh session channel failed: {err}"))?;
    channel
        .request_pty(false, "xterm-256color", 120, 34, 0, 0, &[])
        .await
        .map_err(|err| format!("request ssh pty failed: {err}"))?;
    channel
        .request_shell(true)
        .await
        .map_err(|err| format!("request ssh shell failed: {err}"))?;

    loop {
        tokio::select! {
            Some(input) = input_rx.recv() => {
                match input {
                    NativeTerminalInput::Data(data) => {
                        channel
                            .data(&data[..])
                            .await
                            .map_err(|err| format!("write ssh terminal input failed: {err}"))?;
                    }
                    NativeTerminalInput::Resize(cols, rows) => {
                        let _ = channel.window_change(cols as u32, rows as u32, 0, 0).await;
                    }
                    NativeTerminalInput::Close => {
                        let _ = channel.close().await;
                        break;
                    }
                }
            }
            msg = channel.wait() => {
                match msg {
                    Some(ChannelMsg::Data { data }) => {
                        record_and_emit(&app_handle, &session_id, &pending_output, data.as_ref());
                    }
                    Some(ChannelMsg::ExtendedData { data, .. }) => {
                        record_and_emit(&app_handle, &session_id, &pending_output, data.as_ref());
                    }
                    Some(ChannelMsg::ExitStatus { exit_status }) => {
                        let _ = app_handle.emit(&event_exit(&session_id), exit_status as i32);
                    }
                    Some(ChannelMsg::Close) | Some(ChannelMsg::Eof) | None => break,
                    _ => {}
                }
            }
        }
    }

    let _ = handle
        .disconnect(Disconnect::ByApplication, "", "English")
        .await;
    Ok(())
}

fn open_native_password_terminal(
    app_handle: &tauri::AppHandle,
    conn_id: &str,
    conn: crate::db::ssh_connection_repo::SshConnectionInfo,
) -> Result<SshTerminalSessionInfo, String> {
    let (password, _) = crate::db::ssh_connection_repo::get_ssh_auth_secret(app_handle, conn_id)?;
    let password = password.unwrap_or_default();
    if password.is_empty() {
        return Err("password auth selected but password is empty".to_string());
    }

    let session_id = uuid::Uuid::new_v4().to_string();
    let (input_tx, input_rx) = mpsc::unbounded_channel();
    let pending_output = Arc::new(Mutex::new(Vec::new()));
    let task_app = app_handle.clone();
    let task_session = session_id.clone();
    let task_pending = pending_output.clone();
    let task = tauri::async_runtime::spawn(async move {
        let result = run_native_password_terminal(
            task_app.clone(),
            task_session.clone(),
            conn,
            password,
            task_pending.clone(),
            input_rx,
        )
        .await;
        if let Err(err) = result {
            let line = format!("{err}\r\n");
            record_and_emit(&task_app, &task_session, &task_pending, line.as_bytes());
            let _ = task_app.emit(&event_exit(&task_session), 1);
        } else {
            let _ = task_app.emit(&event_exit(&task_session), 0);
        }
        if let Ok(mut guard) = native_pool().lock() {
            guard.remove(&task_session);
        }
    });

    {
        let mut guard = native_pool()
            .lock()
            .map_err(|_| "failed to acquire native terminal pool lock".to_string())?;
        guard.insert(
            session_id.clone(),
            NativeTerminalSession {
                session_id: session_id.clone(),
                conn_id: conn_id.to_string(),
                app_handle: app_handle.clone(),
                input_tx,
                task,
                pending_output,
            },
        );
    }

    Ok(SshTerminalSessionInfo {
        session_id,
        conn_id: conn_id.to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
    })
}

pub fn open_terminal(
    app_handle: &tauri::AppHandle,
    conn_id: &str,
) -> Result<SshTerminalSessionInfo, String> {
    let session = super::session_pool::get_session(conn_id)?;
    if session.config.auth_type == "password" && session.config.jump_host_id.is_none() {
        return open_native_password_terminal(app_handle, conn_id, session.config);
    }

    let session_id = uuid::Uuid::new_v4().to_string();
    let launch = build_ssh_command(app_handle, conn_id)?;

    let mut command = Command::new(launch.program);
    command
        .args(launch.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = command
        .spawn()
        .map_err(|err| format!("failed to launch ssh process: {err}"))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "failed to capture ssh stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "failed to capture ssh stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "failed to capture ssh stderr".to_string())?;

    let session = TerminalSession {
        session_id: session_id.clone(),
        conn_id: conn_id.to_string(),
        app_handle: app_handle.clone(),
        stdin: Arc::new(Mutex::new(stdin)),
        child: Arc::new(Mutex::new(child)),
        runtime_key_path: launch.runtime_key_path,
        pending_output: Arc::new(Mutex::new(Vec::new())),
    };

    {
        let mut guard = pool()
            .lock()
            .map_err(|_| "failed to acquire terminal pool lock".to_string())?;
        guard.insert(session_id.clone(), session);
    }

    let responder = Arc::new(Mutex::new(PasswordResponder::new(launch.auth_responses)));

    let session_ref_out = {
        let guard = pool()
            .lock()
            .map_err(|_| "failed to acquire terminal pool lock".to_string())?;
        guard
            .get(&session_id)
            .map(|s| {
                (
                    s.app_handle.clone(),
                    s.session_id.clone(),
                    s.pending_output.clone(),
                    s.stdin.clone(),
                )
            })
            .ok_or_else(|| "terminal session not found after spawn".to_string())?
    };
    let responder_out = responder.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (app_handle, sid, pending, stdin) = session_ref_out;
        let mut reader = stdout;
        let mut buffer = [0u8; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(n) => {
                    if let Ok(mut responder) = responder_out.lock() {
                        let _ = responder.maybe_write_response(&buffer[..n], &stdin);
                    }
                    if let Ok(mut p) = pending.lock() {
                        p.extend_from_slice(&buffer[..n]);
                    }
                    emit_output(&app_handle, &sid, &buffer[..n]);
                }
                Err(_) => break,
            }
        }
    });

    let session_ref_err = {
        let guard = pool()
            .lock()
            .map_err(|_| "failed to acquire terminal pool lock".to_string())?;
        guard
            .get(&session_id)
            .map(|s| {
                (
                    s.app_handle.clone(),
                    s.session_id.clone(),
                    s.pending_output.clone(),
                    s.stdin.clone(),
                )
            })
            .ok_or_else(|| "terminal session not found after spawn".to_string())?
    };
    let responder_err = responder.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (app_handle, sid, pending, stdin) = session_ref_err;
        let mut reader = stderr;
        let mut buffer = [0u8; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(n) => {
                    if let Ok(mut responder) = responder_err.lock() {
                        let _ = responder.maybe_write_response(&buffer[..n], &stdin);
                    }
                    if let Ok(mut p) = pending.lock() {
                        p.extend_from_slice(&buffer[..n]);
                    }
                    emit_output(&app_handle, &sid, &buffer[..n]);
                }
                Err(_) => break,
            }
        }
    });

    let wait_handle = app_handle.clone();
    let wait_session = session_id.clone();
    let child_ref = {
        let guard = pool()
            .lock()
            .map_err(|_| "failed to acquire terminal pool lock".to_string())?;
        guard
            .get(&session_id)
            .map(|item| item.child.clone())
            .ok_or_else(|| "terminal session not found after spawn".to_string())?
    };
    tauri::async_runtime::spawn_blocking(move || {
        let exit_code = {
            let mut child = match child_ref.lock() {
                Ok(v) => v,
                Err(_) => return,
            };
            match child.wait() {
                Ok(status) => status.code().unwrap_or(0),
                Err(_) => 1,
            }
        };
        let _ = wait_handle.emit(&event_exit(&wait_session), exit_code);
        if let Ok(mut guard) = pool().lock() {
            if let Some(session) = guard.remove(&wait_session) {
                if let Some(path) = session.runtime_key_path {
                    let _ = std::fs::remove_file(path);
                }
            }
        }
    });

    Ok(SshTerminalSessionInfo {
        session_id,
        conn_id: conn_id.to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
    })
}

pub fn drain_output(session_id: &str) -> Result<String, String> {
    if let Some(pending_ref) = {
        let guard = native_pool()
            .lock()
            .map_err(|_| "failed to acquire native terminal pool lock".to_string())?;
        guard
            .get(session_id)
            .map(|item| item.pending_output.clone())
    } {
        let mut pending = pending_ref
            .lock()
            .map_err(|_| "failed to lock native pending output".to_string())?;
        let payload = base64::engine::general_purpose::STANDARD.encode(&*pending);
        pending.clear();
        return Ok(payload);
    }

    let pending_ref = {
        let guard = pool()
            .lock()
            .map_err(|_| "failed to acquire terminal pool lock".to_string())?;
        guard
            .get(session_id)
            .map(|item| item.pending_output.clone())
            .ok_or_else(|| format!("terminal session `{session_id}` not found"))?
    };
    let mut pending = pending_ref
        .lock()
        .map_err(|_| "failed to lock pending output".to_string())?;
    let payload = base64::engine::general_purpose::STANDARD.encode(&*pending);
    pending.clear();
    Ok(payload)
}

pub fn terminal_input(session_id: &str, data: &[u8]) -> Result<(), String> {
    if let Some(input_tx) = {
        let guard = native_pool()
            .lock()
            .map_err(|_| "failed to acquire native terminal pool lock".to_string())?;
        guard.get(session_id).map(|item| item.input_tx.clone())
    } {
        return input_tx
            .send(NativeTerminalInput::Data(data.to_vec()))
            .map_err(|_| format!("native terminal session `{session_id}` is closed"));
    }

    let stdin_ref = {
        let guard = pool()
            .lock()
            .map_err(|_| "failed to acquire terminal pool lock".to_string())?;
        guard
            .get(session_id)
            .map(|item| item.stdin.clone())
            .ok_or_else(|| format!("terminal session `{session_id}` not found"))?
    };
    let mut stdin = stdin_ref
        .lock()
        .map_err(|_| "failed to lock terminal stdin".to_string())?;
    stdin
        .write_all(data)
        .map_err(|err| format!("write terminal input failed: {err}"))?;
    stdin
        .flush()
        .map_err(|err| format!("flush terminal input failed: {err}"))?;
    Ok(())
}

pub fn terminal_resize(session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
    if let Some(input_tx) = {
        let guard = native_pool()
            .lock()
            .map_err(|_| "failed to acquire native terminal pool lock".to_string())?;
        guard.get(session_id).map(|item| item.input_tx.clone())
    } {
        return input_tx
            .send(NativeTerminalInput::Resize(cols, rows))
            .map_err(|_| format!("native terminal session `{session_id}` is closed"));
    }

    let guard = pool()
        .lock()
        .map_err(|_| "failed to acquire terminal pool lock".to_string())?;
    if guard.contains_key(session_id) {
        return Ok(());
    }
    Err(format!("terminal session `{session_id}` not found"))
}

pub fn close_terminal(session_id: &str, exit_code: i32) -> Result<(), String> {
    let native_removed = {
        let mut guard = native_pool()
            .lock()
            .map_err(|_| "failed to acquire native terminal pool lock".to_string())?;
        guard.remove(session_id)
    };
    if let Some(session) = native_removed {
        let _ = session.input_tx.send(NativeTerminalInput::Close);
        session.task.abort();
        session
            .app_handle
            .emit(&event_exit(session_id), exit_code)
            .map_err(|err| format!("emit native terminal exit failed: {err}"))?;
        return Ok(());
    }

    let removed = {
        let mut guard = pool()
            .lock()
            .map_err(|_| "failed to acquire terminal pool lock".to_string())?;
        guard.remove(session_id)
    };
    if let Some(session) = removed {
        if let Ok(mut child) = session.child.lock() {
            let _ = child.kill();
        }
        if let Some(path) = session.runtime_key_path {
            let _ = std::fs::remove_file(path);
        }
        session
            .app_handle
            .emit(&event_exit(session_id), exit_code)
            .map_err(|err| format!("emit terminal exit failed: {err}"))?;
        return Ok(());
    }
    Err(format!("terminal session `{session_id}` not found"))
}

pub fn close_by_conn(conn_id: &str) -> Result<(), String> {
    let native_ids = {
        let guard = native_pool()
            .lock()
            .map_err(|_| "failed to acquire native terminal pool lock".to_string())?;
        guard
            .values()
            .filter(|item| item.conn_id == conn_id)
            .map(|item| item.session_id.clone())
            .collect::<Vec<_>>()
    };
    for session_id in native_ids {
        let _ = close_terminal(&session_id, 130);
    }

    let ids = {
        let guard = pool()
            .lock()
            .map_err(|_| "failed to acquire terminal pool lock".to_string())?;
        guard
            .values()
            .filter(|item| item.conn_id == conn_id)
            .map(|item| item.session_id.clone())
            .collect::<Vec<_>>()
    };
    for session_id in ids {
        let _ = close_terminal(&session_id, 130);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::is_password_prompt;

    #[test]
    fn detects_common_password_prompts() {
        assert!(is_password_prompt("root@192.168.67.172's password:"));
        assert!(is_password_prompt("Password for root@host:"));
    }

    #[test]
    fn ignores_non_password_output() {
        assert!(!is_password_prompt("welcome to jumpserver ssh server"));
        assert!(!is_password_prompt("permission denied (publickey)"));
    }
}
