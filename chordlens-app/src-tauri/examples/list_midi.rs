// Standalone check that midir can enumerate MIDI inputs on this machine.
use midir::MidiInput;

fn main() {
    let midi_in = MidiInput::new("ChordLens-example").expect("create MidiInput");
    let ports = midi_in.ports();
    println!("midir sees {} MIDI input port(s):", ports.len());
    for p in ports.iter() {
        println!("  - {}", midi_in.port_name(p).unwrap_or_else(|_| "?".into()));
    }
}
