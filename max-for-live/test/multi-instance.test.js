/**
 * Two ChordLens devices, one port. Run with: node --test max-for-live/test
 *
 * Everything here talks over a real socket to the real bridge — the only part
 * stubbed is `max-api` (see instance.js), because Node-for-Max isn't available
 * outside Ableton.
 */

const { test, describe, before, after, afterEach } = require('node:test');
const assert = require('node:assert');
const { fork } = require('node:child_process');
const path = require('node:path');

const INSTANCE = path.join(__dirname, 'instance.js');
const PORT = 18777; // not 17999: don't collide with a real device while testing
const URL = `ws://127.0.0.1:${PORT}`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll until `fn()` returns truthy, or fail after `timeout`. */
async function until(fn, timeout = 5000, label = 'condition') {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await wait(50);
  }
}

/** One device: a forked bridge whose console output we can inspect. */
function startDevice() {
  const child = fork(INSTANCE, {
    env: { ...process.env, CHORDLENS_WS_PORT: String(PORT) },
    stdio: 'pipe',
  });
  const logs = [];
  child.on('message', (m) => {
    if (m.log) logs.push(m.log);
  });
  return {
    child,
    logs,
    said: (needle) => logs.some((l) => l.includes(needle)),
    /** Pretend the v8 object resolved which track this device sits on. */
    announceTrack: (index, name) =>
      child.send({
        call: 'fromlive',
        args: [JSON.stringify({ type: 'device', track: { index, name } })],
      }),
    play: (pitch, velocity) => child.send({ call: 'note', args: [pitch, velocity] }),
    stop: () =>
      new Promise((resolve) => {
        child.on('exit', resolve);
        child.kill();
      }),
  };
}

/** An app connection, collecting every message the bridge pushes. */
async function connectApp() {
  const ws = new WebSocket(URL);
  const messages = [];
  ws.addEventListener('message', (e) => messages.push(JSON.parse(e.data)));
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  return {
    ws,
    messages,
    of: (type) => messages.filter((m) => m.type === type),
    close: () => ws.close(),
  };
}

describe('two devices, one port', () => {
  let devices = [];
  let apps = [];

  const track = (d) => devices.push(d) && d;

  afterEach(async () => {
    for (const a of apps) a.close();
    apps = [];
    for (const d of devices) await d.stop();
    devices = [];
    await wait(150); // let the port come back
  });

  test('the first device becomes the hub', async () => {
    const a = track(startDevice());
    await until(() => a.said('hub listening'), 5000, 'hub election');
    assert.ok(!a.said('satellite'));
  });

  test('the second device joins as a satellite instead of failing', async () => {
    const a = track(startDevice());
    await until(() => a.said('hub listening'), 5000, 'hub election');

    const b = track(startDevice());
    await until(() => b.said('satellite'), 5000, 'satellite election');
    assert.ok(!b.said('hub listening'), 'the second device must not claim the port');
  });

  test('the app hears both tracks through one connection', async () => {
    const a = track(startDevice());
    await until(() => a.said('hub listening'), 5000, 'hub election');
    a.announceTrack(0, 'Keys');

    const b = track(startDevice());
    await until(() => b.said('satellite'), 5000, 'satellite election');
    b.announceTrack(3, 'Bass');

    const app = await connectApp();
    apps.push(app);

    // Both tracks show up in the roster.
    const roster = await until(
      () => app.of('tracks').find((m) => m.tracks.length === 2),
      5000,
      'both tracks in the roster',
    );
    const byIndex = Object.fromEntries(roster.tracks.map((t) => [t.index, t.name]));
    assert.deepStrictEqual(byIndex, { 0: 'Keys', 3: 'Bass' });

    // And notes arrive stamped with the track that played them.
    a.play(60, 100);
    b.play(40, 100);
    await until(() => app.of('note').length >= 2, 5000, 'notes from both devices');

    const notes = app.of('note').map((n) => [n.pitch, n.track]);
    assert.ok(
      notes.some(([p, t]) => p === 60 && t === 0),
      `expected C3 tagged track 0, got ${JSON.stringify(notes)}`,
    );
    assert.ok(
      notes.some(([p, t]) => p === 40 && t === 3),
      `expected E1 tagged track 3, got ${JSON.stringify(notes)}`,
    );
  });

  test('a device that moves to another track replaces its roster entry', async () => {
    // Adding, deleting or reordering tracks in Live renumbers them, so a device
    // re-reports itself under a new index. Keying the roster by index left the
    // old number behind, and the picker filled up with ghosts of one device.
    const a = track(startDevice());
    await until(() => a.said('hub listening'), 5000, 'hub election');
    const b = track(startDevice());
    await until(() => b.said('satellite'), 5000, 'satellite election');

    const app = await connectApp();
    apps.push(app);

    a.announceTrack(6, 'Chords');
    b.announceTrack(1, 'Bass');
    await until(
      () => app.of('tracks').find((m) => m.tracks.length === 2),
      5000,
      'both devices in the roster',
    );

    // Someone deletes the tracks above them; both slide down the set.
    a.announceTrack(2, 'Chords');
    b.announceTrack(0, 'Bass');
    await until(
      () =>
        app
          .of('tracks')
          .slice(-1)
          .find((m) => m.tracks.length === 2 && m.tracks[0].index === 0),
      5000,
      'roster to follow the move',
    );

    const latest = app.of('tracks').at(-1).tracks;
    assert.strictEqual(latest.length, 2, `stale entries left behind: ${JSON.stringify(latest)}`);
    assert.deepStrictEqual(
      latest.map((t) => [t.index, t.name]),
      [
        [0, 'Bass'],
        [2, 'Chords'],
      ],
    );
  });

  test('a departing satellite drops out of the roster', async () => {
    const a = track(startDevice());
    await until(() => a.said('hub listening'), 5000, 'hub election');
    a.announceTrack(0, 'Keys');
    const b = track(startDevice());
    await until(() => b.said('satellite'), 5000, 'satellite election');
    b.announceTrack(3, 'Bass');

    const app = await connectApp();
    apps.push(app);
    await until(
      () => app.of('tracks').find((m) => m.tracks.length === 2),
      5000,
      'both tracks',
    );

    devices = devices.filter((d) => d !== b);
    await b.stop();

    const shrunk = await until(
      () => app.of('tracks').at(-1)?.tracks.length === 1 && app.of('tracks').at(-1),
      5000,
      'roster to shrink',
    );
    assert.deepStrictEqual(shrunk.tracks.map((t) => t.name), ['Keys']);
  });

  test('song state is reported once, not once per device', async () => {
    const a = track(startDevice());
    await until(() => a.said('hub listening'), 5000, 'hub election');
    const b = track(startDevice());
    await until(() => b.said('satellite'), 5000, 'satellite election');

    const app = await connectApp();
    apps.push(app);
    await wait(100);
    const before = app.of('tempo').length;

    // Both devices' Live API observers fire — only the hub's should reach the app.
    const tempo = JSON.stringify({ type: 'tempo', tempo: 128 });
    a.child.send({ call: 'fromlive', args: [tempo] });
    b.child.send({ call: 'fromlive', args: [tempo] });
    await wait(400);

    assert.strictEqual(app.of('tempo').length - before, 1);
  });

  test('a satellite takes over when the hub goes away', async () => {
    const a = track(startDevice());
    await until(() => a.said('hub listening'), 5000, 'hub election');
    const b = track(startDevice());
    await until(() => b.said('satellite'), 5000, 'satellite election');
    b.announceTrack(3, 'Bass');

    // Pull the hub's device off its track.
    devices = devices.filter((d) => d !== a);
    await a.stop();

    await until(() => b.said('hub listening'), 8000, 'satellite promoted to hub');

    // The app can connect again, and the survivor still knows its own track.
    const app = await connectApp();
    apps.push(app);
    b.play(40, 100);
    const note = await until(
      () => app.of('note').find((n) => n.pitch === 40),
      5000,
      'a note from the promoted device',
    );
    assert.strictEqual(note.track, 3);
  });
});
