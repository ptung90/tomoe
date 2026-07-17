use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

/// Holds the file path passed on launch (cold start), until the frontend pulls it.
struct StartupFile(Mutex<Option<String>>);

/// First non-flag argument after the executable path = the file to open.
fn first_file_arg(args: &[String]) -> Option<String> {
    args.iter().skip(1).find(|a| !a.starts_with('-')).cloned()
}

/// Emit an open-file event to an already-running instance (warm start).
fn emit_open_file(app: &AppHandle, args: &[String]) {
    if let Some(path) = first_file_arg(args) {
        let _ = app.emit("open-file", path);
    }
}

/// Frontend pulls (and clears) the launch file once it is ready — avoids the
/// cold-start race where an emitted event fires before the listener exists.
#[tauri::command]
fn take_startup_file(state: State<StartupFile>) -> Option<String> {
    state.0.lock().unwrap().take()
}

/// The OS account name, used to seed the collaboration "Your name" identity.
/// Windows sets USERNAME; Unix sets USER. Empty string if neither is set.
#[tauri::command]
fn os_username() -> String {
    std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_default()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            emit_open_file(app, &args);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(StartupFile(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![take_startup_file, os_username])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            let args: Vec<String> = std::env::args().collect();
            if let Some(path) = first_file_arg(&args) {
                *app.state::<StartupFile>().0.lock().unwrap() = Some(path);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
