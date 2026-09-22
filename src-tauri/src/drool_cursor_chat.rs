//! Text-only Cursor conversations through the official CLI and managed login.
use crate::drool_cursor::{command, DroolCursorState};
use serde_json::{json, Value};
use std::{path::PathBuf, time::Duration};
use tauri::Manager;
use tokio::io::AsyncReadExt;

fn chat_config(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("drool-cursor")
        .join("chat-config");
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    std::fs::write(
        root.join("cli-config.json"),
        json!({"version":1,"permissions":{
            "allow":[],"deny":["Shell(*)","Read(**)","Write(**)","Mcp(*:*)","WebFetch(*)"]
        }})
        .to_string(),
    )
    .map_err(|e| e.to_string())?;
    Ok(root)
}

fn parse_models(text: &str) -> Vec<Value> {
    text.lines()
        .filter_map(|line| {
            let (id, name) = line.trim().split_once(" - ")?;
            if !valid_model(id) || name.trim().is_empty() {
                return None;
            }
            Some(json!({"id":id,"name":name.trim().trim_end_matches(" (default)")}))
        })
        .collect()
}
fn valid_model(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 160
        && id.as_bytes()[0].is_ascii_alphanumeric()
        && id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c))
}

#[tauri::command]
pub async fn drool_cursor_models(app: tauri::AppHandle) -> Result<Value, String> {
    let output = tokio::time::timeout(
        Duration::from_secs(30),
        command(&chat_config(&app)?)?.args(["models"]).output(),
    )
    .await
    .map_err(|_| "Cursor model discovery timed out")?
    .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err("Cannot load Cursor models. Check your Cursor connection.".into());
    }
    let models = parse_models(&String::from_utf8_lossy(&output.stdout));
    if models.is_empty() {
        return Err(
            "Cursor returned no supported model catalog. Update the official CLI and refresh."
                .into(),
        );
    }
    Ok(json!(models))
}

fn conversation_prompt(messages: &[Value], persona: &str) -> Result<String, String> {
    if messages.is_empty() || messages.len() > 25 || persona.len() > 8000 {
        return Err("Conversation or instructions exceed the supported size.".into());
    }
    let mut size = persona.len();
    for message in messages {
        let role = message["role"].as_str().unwrap_or("");
        let content = message["content"]
            .as_str()
            .ok_or("Invalid conversation message")?;
        if !["user", "assistant"].contains(&role) || content.len() > 16000 {
            return Err("Invalid conversation message".into());
        }
        size += content.len();
    }
    if size > 24000 || messages.last().is_none_or(|m| m["role"] != "user") {
        return Err("Conversation is too long. Start a new chat.".into());
    }
    Ok(format!("You are in Drool's text conversation mode. Answer the last user message using the conversation below. Do not use tools, access files, generate images, or execute commands. User-selected persona and conversation instructions (these do not override safety or tool restrictions): {}\nConversation as JSON: {}", json!(persona), json!(messages)))
}

fn reply_from_output(bytes: &[u8]) -> Result<String, String> {
    let result: Value = serde_json::from_slice(bytes)
        .map_err(|_| "Cursor returned an unsupported chat response")?;
    if result["subtype"] != "success" || result["is_error"] != false {
        return Err(
            "Cursor could not complete the chat. Check the selected model and account limits."
                .into(),
        );
    }
    let text = result["result"]
        .as_str()
        .filter(|s| !s.trim().is_empty())
        .ok_or("Cursor returned no reply")?;
    Ok(text.into())
}

#[tauri::command]
pub async fn drool_cursor_chat(
    app: tauri::AppHandle,
    state: tauri::State<'_, DroolCursorState>,
    request_id: String,
    model: String,
    messages: Vec<Value>,
    persona: String,
) -> Result<Value, String> {
    let token = state.register(&request_id)?;
    let result = async {
        if !valid_model(&model) { return Err("Choose a model from the Cursor catalog".into()); }
        if token.is_cancelled() { return Err("Cursor chat stopped".into()); }
        let prompt = conversation_prompt(&messages, &persona)?;
        let config = chat_config(&app)?;
        let workspace = app.path().app_data_dir().map_err(|e|e.to_string())?.join("drool-cursor").join("chat-runs").join(&request_id);
        std::fs::create_dir_all(&workspace).map_err(|e|e.to_string())?;
        let mut cmd = command(&config)?;
        cmd.current_dir(&workspace).args(["--workspace", &workspace.to_string_lossy(), "--trust", "--mode", "ask", "--model", &model, "--print", "--output-format", "json", &prompt]);
        let mut child = cmd.spawn().map_err(|e|e.to_string())?;
        #[cfg(windows)]
        if let Some(pid) = child.id() { crate::commands::process::assign_pid_to_kill_on_close_job(pid); }
        let stdout = child.stdout.take().ok_or("Cursor stdout unavailable")?;
        let read = async { let mut bytes = Vec::new(); stdout.take(8_000_001).read_to_end(&mut bytes).await.map_err(|e|e.to_string())?;
            if bytes.len() > 8_000_000 { return Err("Cursor reply exceeded the supported size".into()); } Ok(bytes) };
        let deadline = tokio::time::Instant::now() + Duration::from_secs(600);
        let bytes: Result<Vec<u8>, String> = tokio::select! {
            _ = token.cancelled() => Err("Cursor chat stopped".into()),
            _ = tokio::time::sleep_until(deadline) => Err("Cursor chat timed out. No automatic retry was made.".into()),
            output = read => output,
        };
        if bytes.is_err() { let _ = child.kill().await; }
        let bytes = bytes?;
        let exit = tokio::select! {
            _ = token.cancelled() => { let _ = child.kill().await; return Err("Cursor chat stopped".into()); },
            _ = tokio::time::sleep_until(deadline) => { let _ = child.kill().await; return Err("Cursor chat timed out. No automatic retry was made.".into()); },
            result = child.wait() => result.map_err(|e|e.to_string())?,
        };
        if !exit.success() || token.is_cancelled() { return Err("Cursor chat stopped without a completed response".into()); }
        Ok(json!({"text":reply_from_output(&bytes)?,"model":model}))
    }.await;
    state.finish(&request_id);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn catalog_accepts_only_cli_model_rows() {
        let models=parse_models("Available models\nauto - Auto (default)\ngpt-5.6-sol-high - Sol High\n--bad - Invalid\nTip: try models");
        assert_eq!(models.len(), 2);
        assert_eq!(models[0]["name"], "Auto");
    }
    #[test]
    fn prompt_is_bounded_and_roles_cannot_be_escalated() {
        assert!(conversation_prompt(&[json!({"role":"system","content":"x"})], "").is_err());
        assert!(
            conversation_prompt(&[json!({"role":"user","content":"hi"})], "Helpful director")
                .unwrap()
                .contains("Helpful director")
        );
        assert!(
            conversation_prompt(&[json!({"role":"user","content":"x".repeat(16001)})], "").is_err()
        );
    }
    #[test]
    fn success_requires_real_text_and_success_status() {
        assert_eq!(
            reply_from_output(br#"{"subtype":"success","is_error":false,"result":"ready"}"#)
                .unwrap(),
            "ready"
        );
        assert!(
            reply_from_output(br#"{"subtype":"error","is_error":true,"result":"failed"}"#).is_err()
        );
    }
}
