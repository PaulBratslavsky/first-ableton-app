/**
 * Runs chordlens.server.js outside Max, with `max-api` stubbed.
 *
 * The bridge's hub/satellite election only shows itself when two devices are
 * live at once, which is exactly the case that can't be eyeballed inside
 * Ableton. Forking this file twice reproduces it: each child is one device.
 *
 * Parent → child (process.send):
 *   { call: "note",     args: [pitch, velocity] }   as if MIDI arrived
 *   { call: "fromlive", args: [jsonString] }        as if the v8 object spoke
 * Child → parent:
 *   { log }      whatever the device posted to the Max console
 *   { outlet }   whatever it sent towards the v8 object
 */

const Module = require('module');

const handlers = Object.create(null);

const maxApiStub = {
  post: (...args) => process.send({ log: args.map(String).join(' ') }),
  outlet: (...args) => process.send({ outlet: args.map(String) }),
  addHandler: (name, fn) => {
    handlers[name] = fn;
  },
  POST_LEVELS: { ERROR: 'error', WARN: 'warn', INFO: 'info' },
};

// `max-api` only exists inside Node-for-Max, so hand out the stub instead.
const load = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'max-api') return maxApiStub;
  return load.call(this, request, parent, isMain);
};

require(require('path').join(__dirname, '..', 'chordlens.server.js'));

process.on('message', (msg) => {
  const fn = handlers[msg.call];
  if (fn) fn(...msg.args);
});

process.send({ ready: true });
