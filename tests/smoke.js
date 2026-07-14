const assert = require("node:assert/strict");
const { io } = require("socket.io-client");

const baseUrl = process.env.TEST_URL || "http://localhost:3030";
const roomId = `smoke-${Date.now()}`;

function once(socket, event) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 4000);
    socket.once(event, (value) => { clearTimeout(timeout); resolve(value); });
  });
}

async function run() {
  const page = await fetch(`${baseUrl}/${roomId}`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Gatherly/);

  const signaling = await fetch(`${baseUrl}/peerjs/peerjs/id?ts=${Date.now()}&version=1.5.4`);
  assert.equal(signaling.status, 200);
  assert.ok((await signaling.text()).length > 5);

  const first = io(baseUrl, { autoConnect: false });
  const second = io(baseUrl, { autoConnect: false });
  const connections = Promise.all([once(first, "connect"), once(second, "connect")]);
  first.connect();
  second.connect();
  await connections;

  first.emit("join-room", { roomId, peerId: "peer-a", name: "Alex", media: { audio: true, video: true } });
  await once(first, "room-state");
  second.emit("join-room", { roomId, peerId: "peer-b", name: "Sam", media: { audio: true, video: false } });
  const state = await once(second, "room-state");
  assert.equal(state.participants.length, 2);

  const messagePromise = once(first, "chat-message");
  second.emit("chat-message", "Hello from the smoke test");
  const message = await messagePromise;
  assert.equal(message.text, "Hello from the smoke test");
  assert.equal(message.sender, "Sam");

  const mediaPromise = once(first, "participant-media");
  second.emit("media-state", { audio: false, video: false });
  assert.deepEqual((await mediaPromise).media, { audio: false, video: false });

  const drawPromise = once(first, "board-draw");
  second.emit("board-draw", { from: { x: 0.1, y: 0.1 }, to: { x: 0.2, y: 0.2 }, color: "#123456", width: 3 });
  assert.equal((await drawPromise).color, "#123456");

  first.disconnect();
  second.disconnect();
  console.log("Smoke test passed: page, signaling, participants, chat, media, and whiteboard.");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
