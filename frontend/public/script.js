const $ = (selector) => document.querySelector(selector);
const ROOM_ID = document.body.dataset.roomId;
const socket = io();
const state = {
  name: "",
  peerId: "",
  stream: null,
  cameraStream: null,
  screenStream: null,
  peer: null,
  calls: new Map(),
  participants: new Map(),
  audio: true,
  video: true,
  panel: "chat",
  recording: null,
  recordChunks: [],
  drawing: false,
  boardHistory: [],
};

const icons = {
  mic: '<svg viewBox="0 0 24 24"><rect x="8" y="3" width="8" height="12" rx="4"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/></svg>',
  screen: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  record: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></svg>',
  board: '<svg viewBox="0 0 24 24"><path d="M4 3h16v14H4zM8 21l4-4 4 4M8 8h8M8 12h5"/></svg>',
  people: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.07.07l2-2A5 5 0 0 0 12 4l-1.15 1.15M14 11a5 5 0 0 0-7.07-.07l-2 2A5 5 0 0 0 12 20l1.15-1.15"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4zM22 2 11 13"/></svg>',
};

document.querySelectorAll("[data-icon]").forEach((node) => { node.innerHTML = icons[node.dataset.icon] || ""; });

const ui = {
  joinScreen: $("#joinScreen"), appShell: $("#appShell"), preview: $("#previewVideo"), previewFallback: $("#previewFallback"),
  joinForm: $("#joinForm"), name: $("#displayName"), error: $("#joinError"), grid: $("#videoGrid"), notice: $("#statusNotice"),
  mic: $("#micButton"), camera: $("#cameraButton"), previewMic: $("#previewMic"), previewCamera: $("#previewCamera"),
  share: $("#shareButton"), record: $("#recordButton"), board: $("#boardButton"), boardPanel: $("#whiteboardPanel"),
  sidePanel: $("#sidePanel"), messages: $("#messages"), chatEmpty: $("#chatEmpty"), people: $("#peopleList"), unread: $("#unreadDot"),
  canvas: $("#whiteboardCanvas"), color: $("#brushColor"), colorTool: $(".color-tool"), toast: $("#toastRegion"),
};

function toast(text) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = text;
  ui.toast.append(node);
  setTimeout(() => node.remove(), 3000);
}

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "G";
}

function avatarColor(value) {
  const colors = ["#5b5ce2", "#2f9d84", "#d06a55", "#a459a2", "#3e7fb1", "#ae873f"];
  return colors[[...value].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length];
}

async function getPreview() {
  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 } } });
    state.stream = state.cameraStream;
    ui.preview.srcObject = state.cameraStream;
    ui.notice.textContent = "Ready";
  } catch (error) {
    state.audio = false;
    state.video = false;
    ui.previewFallback.style.display = "grid";
    ui.previewMic.classList.add("is-off");
    ui.previewCamera.classList.add("is-off");
    ui.error.textContent = "Camera access is unavailable. You can still join and use chat or the whiteboard.";
  }
}

function toggleTrack(kind, preview = false) {
  const key = kind === "audio" ? "audio" : "video";
  const track = state.cameraStream?.getTracks().find((item) => item.kind === kind);
  state[key] = !state[key];
  if (track) track.enabled = state[key];
  const buttons = kind === "audio" ? [ui.mic, ui.previewMic] : [ui.camera, ui.previewCamera];
  buttons.forEach((button) => button.classList.toggle(preview ? "is-off" : "is-off", !state[key]));
  if (kind === "video") ui.previewFallback.style.display = state.video && track ? "none" : "grid";
  if (state.peerId) {
    socket.emit("media-state", { audio: state.audio, video: state.video });
    updateParticipantMedia(state.peerId, { audio: state.audio, video: state.video });
  }
  updateControlLabels();
}

function updateControlLabels() {
  ui.mic.querySelector("span:last-child").textContent = state.audio ? "Mute" : "Unmute";
  ui.camera.querySelector("span:last-child").textContent = state.video ? "Stop video" : "Start video";
}

ui.previewMic.addEventListener("click", () => toggleTrack("audio", true));
ui.previewCamera.addEventListener("click", () => toggleTrack("video", true));
ui.mic.addEventListener("click", () => toggleTrack("audio"));
ui.camera.addEventListener("click", () => toggleTrack("video"));

ui.joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  state.name = ui.name.value.trim();
  if (!state.name) { ui.error.textContent = "Please add your name before joining."; return; }
  localStorage.setItem("gatherly-name", state.name);
  ui.previewFallback.textContent = initials(state.name);
  ui.joinScreen.hidden = true;
  ui.appShell.hidden = false;
  $("#meetingCode").textContent = `· ${ROOM_ID.slice(0, 8)}`;
  addOrUpdateParticipant({ id: "local", name: state.name, media: { audio: state.audio, video: state.video } });
  addVideoTile("local", state.name, state.cameraStream, true);
  startPeer();
});

function startPeer() {
  state.peer = new Peer(undefined, { path: "/peerjs/peerjs", host: location.hostname, port: location.port || (location.protocol === "https:" ? 443 : 80), secure: location.protocol === "https:" });
  state.peer.on("open", (id) => {
    state.peerId = id;
    const local = state.participants.get("local");
    state.participants.delete("local");
    state.participants.set(id, { ...local, id });
    const tile = document.querySelector('[data-peer-id="local"]');
    if (tile) tile.dataset.peerId = id;
    socket.emit("join-room", { roomId: ROOM_ID, peerId: id, name: state.name, media: { audio: state.audio, video: state.video } });
    ui.notice.style.opacity = "0";
  });
  state.peer.on("call", (call) => {
    call.answer(state.stream || new MediaStream());
    registerCall(call, call.peer);
  });
  state.peer.on("error", (error) => { console.error(error); toast("Connection issue — retrying may help"); });
}

function registerCall(call, peerId) {
  state.calls.get(peerId)?.close();
  state.calls.set(peerId, call);
  call.on("stream", (stream) => {
    const person = state.participants.get(peerId);
    addVideoTile(peerId, person?.name || "Guest", stream, false);
  });
  call.on("close", () => removeVideoTile(peerId));
  call.on("error", () => removeVideoTile(peerId));
}

function callParticipant(peerId) {
  if (!state.peer || !state.peer.open || peerId === state.peerId) return;
  const call = state.peer.call(peerId, state.stream || new MediaStream(), { metadata: { name: state.name } });
  if (call) registerCall(call, peerId);
}

function addVideoTile(peerId, name, stream, local) {
  let tile = document.querySelector(`[data-peer-id="${CSS.escape(peerId)}"]`);
  if (!tile) {
    tile = document.createElement("article");
    tile.className = `video-tile${local ? " is-local" : ""}`;
    tile.dataset.peerId = peerId;
    tile.innerHTML = `<div class="tile-placeholder"><span class="tile-avatar"></span></div><video autoplay playsinline ${local ? "muted" : ""}></video><div class="tile-meta"><span class="muted-indicator"></span><span class="tile-name"></span></div>`;
    ui.grid.append(tile);
  }
  const video = tile.querySelector("video");
  if (stream && video.srcObject !== stream) video.srcObject = stream;
  tile.querySelector(".tile-name").textContent = local ? `${name} (You)` : name;
  const avatar = tile.querySelector(".tile-avatar");
  avatar.textContent = initials(name);
  avatar.style.setProperty("--avatar", avatarColor(name));
  updateTileMedia(peerId);
  refreshGrid();
}

function removeVideoTile(peerId) {
  document.querySelector(`[data-peer-id="${CSS.escape(peerId)}"]`)?.remove();
  state.calls.delete(peerId);
  refreshGrid();
}

function refreshGrid() { ui.grid.dataset.count = String(ui.grid.children.length); }

function addOrUpdateParticipant(person) {
  state.participants.set(person.id, { ...state.participants.get(person.id), ...person });
  renderPeople();
}

function updateParticipantMedia(id, media) {
  const person = state.participants.get(id);
  if (person) state.participants.set(id, { ...person, media });
  updateTileMedia(id);
  renderPeople();
}

function updateTileMedia(id) {
  const person = state.participants.get(id);
  const tile = document.querySelector(`[data-peer-id="${CSS.escape(id)}"]`);
  if (!person || !tile) return;
  tile.querySelector(".muted-indicator").innerHTML = person.media?.audio === false ? icons.mic : "";
  tile.querySelector(".tile-placeholder").style.display = person.media?.video === false ? "grid" : "none";
}

function renderPeople() {
  ui.people.replaceChildren();
  [...state.participants.values()].forEach((person) => {
    const row = document.createElement("div");
    row.className = "person";
    row.innerHTML = `<span class="person__avatar"></span><span class="person__info"><span class="person__name"></span><span class="person__state"></span></span><span class="person__media"></span>`;
    const isMe = person.id === state.peerId || person.id === "local";
    row.querySelector(".person__avatar").textContent = initials(person.name);
    row.querySelector(".person__avatar").style.setProperty("--avatar", avatarColor(person.name));
    row.querySelector(".person__name").textContent = `${person.name}${isMe ? " (You)" : ""}`;
    row.querySelector(".person__state").textContent = isMe ? "Meeting host" : "In the meeting";
    row.querySelector(".person__media").innerHTML = `${person.media?.audio === false ? icons.mic : ""}${person.media?.video === false ? icons.camera : ""}`;
    ui.people.append(row);
  });
  const count = state.participants.size;
  $("#participantCount").textContent = count;
  $("#tabCount").textContent = count;
}

socket.on("room-state", ({ participants, messages, board }) => {
  participants.forEach((person) => addOrUpdateParticipant(person));
  messages.forEach(renderMessage);
  state.boardHistory = board || [];
  redrawBoard();
  participants.filter((person) => person.id !== state.peerId).forEach((person) => setTimeout(() => callParticipant(person.id), 250));
});
socket.on("participant-joined", (person) => { addOrUpdateParticipant(person); toast(`${person.name} joined the meeting`); });
socket.on("participants-updated", (participants) => {
  const known = new Set(participants.map((person) => person.id));
  [...state.participants.keys()].forEach((id) => { if (id !== "local" && !known.has(id)) state.participants.delete(id); });
  participants.forEach(addOrUpdateParticipant);
  renderPeople();
});
socket.on("participant-left", (id) => { removeVideoTile(id); state.participants.delete(id); renderPeople(); });
socket.on("participant-media", ({ id, media }) => updateParticipantMedia(id, media));

function openPanel(panel) {
  state.panel = panel;
  ui.sidePanel.classList.remove("is-closed");
  document.querySelectorAll(".panel-tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.panel === panel));
  document.querySelectorAll(".panel-view").forEach((view) => view.classList.toggle("is-active", view.id === `${panel}Panel`));
  if (panel === "chat") ui.unread.hidden = true;
}
$("#chatButton").addEventListener("click", () => openPanel("chat"));
$("#participantsButton").addEventListener("click", () => openPanel("people"));
$("#closePanel").addEventListener("click", () => ui.sidePanel.classList.add("is-closed"));
document.querySelectorAll(".panel-tab").forEach((tab) => tab.addEventListener("click", () => openPanel(tab.dataset.panel)));

$("#messageForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const field = $("#chatMessage");
  const value = field.value.trim();
  if (!value) return;
  socket.emit("chat-message", value);
  field.value = "";
  field.style.height = "auto";
});
$("#chatMessage").addEventListener("input", (event) => { event.target.style.height = "auto"; event.target.style.height = `${Math.min(event.target.scrollHeight, 110)}px`; });
$("#chatMessage").addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); $("#messageForm").requestSubmit(); } });

function renderMessage(message) {
  if (document.getElementById(`message-${message.id}`)) return;
  ui.chatEmpty?.remove();
  const item = document.createElement("article");
  item.id = `message-${message.id}`;
  item.className = `message${message.senderId === state.peerId ? " is-own" : ""}`;
  const head = document.createElement("div");
  head.className = "message__head";
  const author = document.createElement("span");
  author.className = "message__author";
  author.textContent = message.senderId === state.peerId ? "You" : message.sender;
  const time = document.createElement("time");
  time.className = "message__time";
  time.textContent = new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const body = document.createElement("div");
  body.className = "message__body";
  body.textContent = message.text;
  head.append(author, time);
  item.append(head, body);
  ui.messages.append(item);
  ui.messages.scrollTop = ui.messages.scrollHeight;
  if ((ui.sidePanel.classList.contains("is-closed") || state.panel !== "chat") && message.senderId !== state.peerId) ui.unread.hidden = false;
}
socket.on("chat-message", renderMessage);

async function copyInvite() {
  try { await navigator.clipboard.writeText(location.href); toast("Invite link copied"); }
  catch { window.prompt("Copy this meeting link", location.href); }
}
$("#copyLink").addEventListener("click", copyInvite);
$("#invitePeople").addEventListener("click", copyInvite);

ui.share.addEventListener("click", async () => {
  if (state.screenStream) { stopScreenShare(); return; }
  if (!navigator.mediaDevices?.getDisplayMedia) { toast("Screen sharing is not supported here"); return; }
  try {
    state.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const screenTrack = state.screenStream.getVideoTracks()[0];
    replaceOutgoingVideo(screenTrack);
    state.stream = new MediaStream([screenTrack, ...(state.cameraStream?.getAudioTracks() || [])]);
    const localVideo = document.querySelector(`[data-peer-id="${CSS.escape(state.peerId)}"] video`);
    if (localVideo) localVideo.srcObject = state.screenStream;
    document.querySelector(`[data-peer-id="${CSS.escape(state.peerId)}"]`)?.classList.remove("is-local");
    screenTrack.addEventListener("ended", stopScreenShare, { once: true });
    ui.share.classList.add("is-active");
    ui.share.querySelector("span:last-child").textContent = "Stop share";
    toast("You’re sharing your screen");
  } catch (error) { if (error.name !== "NotAllowedError") toast("Couldn’t start screen sharing"); }
});

function replaceOutgoingVideo(track) {
  state.calls.forEach((call) => {
    const sender = call.peerConnection?.getSenders().find((item) => item.track?.kind === "video");
    if (sender) sender.replaceTrack(track);
  });
}

function stopScreenShare() {
  if (!state.screenStream) return;
  state.screenStream.getTracks().forEach((track) => track.stop());
  state.screenStream = null;
  const cameraTrack = state.cameraStream?.getVideoTracks()[0];
  if (cameraTrack) replaceOutgoingVideo(cameraTrack);
  state.stream = state.cameraStream;
  const localTile = document.querySelector(`[data-peer-id="${CSS.escape(state.peerId)}"]`);
  if (localTile) { localTile.classList.add("is-local"); localTile.querySelector("video").srcObject = state.cameraStream; }
  ui.share.classList.remove("is-active");
  ui.share.querySelector("span:last-child").textContent = "Share";
}

ui.record.addEventListener("click", async () => {
  if (state.recording?.state === "recording") { state.recording.stop(); return; }
  if (!window.MediaRecorder) { toast("Recording is not supported in this browser"); return; }
  const source = state.screenStream || state.cameraStream;
  if (!source) { toast("Turn on a camera or share your screen first"); return; }
  try {
    state.recordChunks = [];
    state.recording = new MediaRecorder(source, { mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm" });
    state.recording.ondataavailable = (event) => { if (event.data.size) state.recordChunks.push(event.data); };
    state.recording.onstop = () => {
      const url = URL.createObjectURL(new Blob(state.recordChunks, { type: "video/webm" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `gatherly-${ROOM_ID.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.webm`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      ui.record.classList.remove("is-off");
      ui.record.querySelector("span:last-child").textContent = "Record";
      toast("Recording saved to your device");
    };
    state.recording.start(1000);
    ui.record.classList.add("is-off");
    ui.record.querySelector("span:last-child").textContent = "Stop";
    toast("Recording started");
  } catch { toast("Couldn’t start recording"); }
});

ui.board.addEventListener("click", () => {
  const opening = ui.boardPanel.hidden;
  ui.boardPanel.hidden = !opening;
  ui.grid.hidden = opening;
  ui.board.classList.toggle("is-active", opening);
  if (opening) { resizeCanvas(); redrawBoard(); }
});

const ctx = ui.canvas.getContext("2d");
let boardTool = "pen";
function resizeCanvas() {
  const rect = ui.canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  ui.canvas.width = Math.max(1, Math.floor(rect.width * scale));
  ui.canvas.height = Math.max(1, Math.floor(rect.height * scale));
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}
function boardPoint(event) {
  const rect = ui.canvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
}
function drawStroke(stroke) {
  const rect = ui.canvas.getBoundingClientRect();
  ctx.beginPath();
  ctx.moveTo(stroke.from.x * rect.width, stroke.from.y * rect.height);
  ctx.lineTo(stroke.to.x * rect.width, stroke.to.y * rect.height);
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}
function redrawBoard() { if (!ui.canvas.width) return; ctx.clearRect(0, 0, ui.canvas.width, ui.canvas.height); state.boardHistory.forEach(drawStroke); }
let lastPoint;
ui.canvas.addEventListener("pointerdown", (event) => { state.drawing = true; lastPoint = boardPoint(event); ui.canvas.setPointerCapture(event.pointerId); });
ui.canvas.addEventListener("pointermove", (event) => {
  if (!state.drawing) return;
  const point = boardPoint(event);
  const stroke = { from: lastPoint, to: point, color: boardTool === "eraser" ? "#ffffff" : ui.color.value, width: boardTool === "eraser" ? 18 : 3 };
  state.boardHistory.push(stroke);
  drawStroke(stroke);
  socket.emit("board-draw", stroke);
  lastPoint = point;
});
["pointerup", "pointercancel"].forEach((eventName) => ui.canvas.addEventListener(eventName, () => { state.drawing = false; }));
socket.on("board-draw", (stroke) => { state.boardHistory.push(stroke); drawStroke(stroke); });
socket.on("board-clear", () => { state.boardHistory = []; redrawBoard(); });
$("#penTool").addEventListener("click", () => setBoardTool("pen"));
$("#eraserTool").addEventListener("click", () => setBoardTool("eraser"));
function setBoardTool(tool) { boardTool = tool; $("#penTool").classList.toggle("is-active", tool === "pen"); $("#eraserTool").classList.toggle("is-active", tool === "eraser"); }
ui.color.addEventListener("input", () => { ui.colorTool.style.setProperty("--brush-color", ui.color.value); setBoardTool("pen"); });
$("#clearBoard").addEventListener("click", () => { if (window.confirm("Clear the whiteboard for everyone?")) socket.emit("board-clear"); });
window.addEventListener("resize", () => { if (!ui.boardPanel.hidden) { resizeCanvas(); redrawBoard(); } });

function leaveMeeting() {
  state.recording?.state === "recording" && state.recording.stop();
  state.screenStream?.getTracks().forEach((track) => track.stop());
  state.cameraStream?.getTracks().forEach((track) => track.stop());
  state.peer?.destroy();
  socket.disconnect();
  location.href = "/";
}
$("#leaveMeeting").addEventListener("click", leaveMeeting);
window.addEventListener("beforeunload", () => state.cameraStream?.getTracks().forEach((track) => track.stop()));

ui.name.value = localStorage.getItem("gatherly-name") || "";
ui.previewFallback.textContent = initials(ui.name.value || "Guest");
getPreview();
