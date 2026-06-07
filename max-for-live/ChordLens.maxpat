{
	"patcher": {
		"fileversion": 1,
		"appversion": {
			"major": 8,
			"minor": 6,
			"revision": 0,
			"architecture": "x64",
			"modernui": 1
		},
		"classnamespace": "box",
		"rect": [80.0, 80.0, 820.0, 560.0],
		"openinpresentation": 0,
		"default_fontsize": 12.0,
		"default_fontface": 0,
		"default_fontname": "Ableton Sans Medium",
		"gridonopen": 1,
		"gridsize": [15.0, 15.0],
		"boxes": [
			{
				"box": {
					"id": "obj-title",
					"maxclass": "comment",
					"numinlets": 1,
					"numoutlets": 0,
					"fontsize": 13.0,
					"patching_rect": [20.0, 14.0, 480.0, 21.0],
					"text": "ChordLens bridge — MIDI from Live + Live API over WebSocket :17999"
				}
			},
			{
				"box": {
					"id": "obj-midiin",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": ["int"],
					"patching_rect": [20.0, 70.0, 50.0, 22.0],
					"text": "midiin"
				}
			},
			{
				"box": {
					"id": "obj-midiin-c",
					"maxclass": "comment",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [78.0, 72.0, 130.0, 21.0],
					"text": "MIDI from Live"
				}
			},
			{
				"box": {
					"id": "obj-midiout",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [20.0, 150.0, 54.0, 22.0],
					"text": "midiout"
				}
			},
			{
				"box": {
					"id": "obj-midiout-c",
					"maxclass": "comment",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [82.0, 152.0, 200.0, 21.0],
					"text": "passthrough → instrument"
				}
			},
			{
				"box": {
					"id": "obj-midiparse",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 7,
					"outlettype": ["", "", "", "", "", "", "int"],
					"patching_rect": [200.0, 110.0, 200.0, 22.0],
					"text": "midiparse"
				}
			},
			{
				"box": {
					"id": "obj-prepend",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [""],
					"patching_rect": [200.0, 160.0, 92.0, 22.0],
					"text": "prepend note"
				}
			},
			{
				"box": {
					"id": "obj-note-c",
					"maxclass": "comment",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [300.0, 162.0, 240.0, 21.0],
					"text": "played/clip notes → WebSocket"
				}
			},
			{
				"box": {
					"id": "obj-thisdevice",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 3,
					"outlettype": ["bang", "bang", ""],
					"patching_rect": [470.0, 70.0, 110.0, 22.0],
					"text": "live.thisdevice"
				}
			},
			{
				"box": {
					"id": "obj-v8",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [""],
					"patching_rect": [470.0, 160.0, 150.0, 22.0],
					"text": "v8 chordlens.v8.js"
				}
			},
			{
				"box": {
					"id": "obj-v8-c",
					"maxclass": "comment",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [630.0, 162.0, 180.0, 21.0],
					"text": "LiveAPI: observe + control"
				}
			},
			{
				"box": {
					"id": "obj-node",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 2,
					"outlettype": ["", ""],
					"patching_rect": [200.0, 280.0, 320.0, 22.0],
					"text": "node.script chordlens.server.js @autostart 1 @watch 1"
				}
			},
			{
				"box": {
					"id": "obj-node-c",
					"maxclass": "comment",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [200.0, 312.0, 460.0, 21.0],
					"text": "WebSocket server — run `npm install` in this folder once"
				}
			}
		],
		"lines": [
			{
				"patchline": {
					"source": ["obj-midiin", 0],
					"destination": ["obj-midiout", 0]
				}
			},
			{
				"patchline": {
					"source": ["obj-midiin", 0],
					"destination": ["obj-midiparse", 0]
				}
			},
			{
				"patchline": {
					"source": ["obj-midiparse", 0],
					"destination": ["obj-prepend", 0]
				}
			},
			{
				"patchline": {
					"source": ["obj-prepend", 0],
					"destination": ["obj-node", 0]
				}
			},
			{
				"patchline": {
					"source": ["obj-thisdevice", 0],
					"destination": ["obj-v8", 0]
				}
			},
			{
				"patchline": {
					"source": ["obj-node", 0],
					"destination": ["obj-v8", 0]
				}
			},
			{
				"patchline": {
					"source": ["obj-v8", 0],
					"destination": ["obj-node", 0]
				}
			}
		]
	}
}
