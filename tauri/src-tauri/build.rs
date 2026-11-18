// Gera as permissões dos comandos do app (allow-<comando>). Quem pode chamar cada um fica em
// capabilities/local.json (telas locais) e em src/lib.rs (o site, que só é conhecido em tempo de execução).
const COMMANDS: &[&str] = &[
    // site
    "desktop_set_badge",
    "desktop_focus",
    "status_report",
    "update_check",
    "app_set_hardware_acceleration",
    "app_set_memory_mode",
    "app_open_logs",
    "perf_snapshot",
    "drop_files",
    "drop_read",
    "presence_configure",
    "presence_candidates",
    "presence_current",
    "screen_audio_plan",
    "screen_audio_stop",
    "screencast_available",
    "screencast_start",
    "screencast_command",
    "screencast_stop",
    "call_join",
    "call_leave",
    "call_push_mic",
    "call_pull",
    "call_set_subscribed",
    "call_pull_video",
    "call_push_camera",
    "call_stop_camera",
    "call_stats",
    "call_keyframe",
    "call_log",
    "call_screen_fallback",
    "shortcuts_configure",
    // tela de "conectando…"
    "shell_get_status",
    "shell_set_server",
    "shell_cancel_change",
    // seletor de tela
    "picker_get_sources",
    "picker_choose",
    "picker_get_audio_apps",
    "picker_choose_audio",
    "picker_cancel",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("falha no tauri-build");
}
