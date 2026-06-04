// ChordLens Tauri backend: reads MIDI in Rust (midir) and emits note events to
// the React frontend over Tauri's event system — the desktop app reads MIDI
// directly, with no helper process.
//
// Frontend contract (event "midi-note"): { pitch: u8, velocity: u8 }
//   velocity > 0 = note-on, velocity 0 = note-off (MIDI note-off is normalized
//   to velocity 0 here).

use std::sync::Mutex;

use midir::{Ignore, MidiInput, MidiInputConnection};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

/// Held MIDI input connection (kept alive so its callback thread keeps running).
#[derive(Default)]
struct MidiState(Mutex<Option<MidiInputConnection<()>>>);

#[derive(Clone, Serialize)]
struct NoteEvent {
    pitch: u8,
    velocity: u8,
}

/// List the names of all available MIDI input ports (keyboards, IAC buses, etc.).
#[tauri::command]
fn list_midi_inputs() -> Result<Vec<String>, String> {
    let midi_in = MidiInput::new("ChordLens-scan").map_err(|e| e.to_string())?;
    let ports = midi_in.ports();
    Ok(ports
        .iter()
        .map(|p| midi_in.port_name(p).unwrap_or_else(|_| "Unknown".into()))
        .collect())
}

/// Open the MIDI input at `index` and start emitting `midi-note` events.
/// Replaces any previously-open connection. Returns the opened port's name.
#[tauri::command]
fn select_midi_input(
    app: AppHandle,
    state: State<MidiState>,
    index: usize,
) -> Result<String, String> {
    let mut midi_in = MidiInput::new("ChordLens-in").map_err(|e| e.to_string())?;
    midi_in.ignore(Ignore::All); // skip sysex, timing-clock, active-sensing

    let ports = midi_in.ports();
    let port = ports.get(index).ok_or("invalid MIDI port index")?;
    let port_name = midi_in.port_name(port).map_err(|e| e.to_string())?;

    let emitter = app.clone();
    let connection = midi_in
        .connect(
            port,
            "chordlens-read",
            move |_timestamp, message, _| {
                if message.len() < 3 {
                    return;
                }
                let status = message[0] & 0xF0;
                let pitch = message[1];
                let velocity = message[2];
                let event = match status {
                    0x90 => Some(NoteEvent { pitch, velocity }), // note-on (vel 0 = off)
                    0x80 => Some(NoteEvent { pitch, velocity: 0 }), // note-off
                    _ => None,
                };
                if let Some(event) = event {
                    let _ = emitter.emit("midi-note", event);
                }
            },
            (),
        )
        .map_err(|e| e.to_string())?;

    // Storing the connection keeps its background thread alive; the previous
    // connection (if any) is dropped here, closing that port.
    *state.0.lock().map_err(|e| e.to_string())? = Some(connection);
    Ok(port_name)
}

/// Close the current MIDI input, if any.
#[tauri::command]
fn disconnect_midi(state: State<MidiState>) -> Result<(), String> {
    *state.0.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(MidiState::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_midi_inputs,
            select_midi_input,
            disconnect_midi
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
