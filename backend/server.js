const path = require("path");
const { randomUUID } = require("crypto");
const express = require("express");
const { createServer } = require("http");
const { ExpressPeerServer } = require("peer");

const app = express();
const server = createServer(app);
const io = require("socket.io")(server);
const PORT = process.env.PORT || 3030;
const rooms = new Map();
const frontendDirectory = path.join(__dirname, "..", "frontend");

app.set("view engine", "ejs");
app.set("views", path.join(frontendDirectory, "views"));
app.use(express.static(path.join(frontendDirectory, "public")));
app.use("/peerjs", ExpressPeerServer(server, { debug: false }));

app.get("/", (_req, res) => res.redirect(`/${randomUUID()}`));
app.get("/:room", (req, res) => {
  const roomId = String(req.params.room).replace(/[^a-zA-Z0-9-]/g, "").slice(0, 80);
  if (!roomId) return res.redirect("/");
  return res.render("room", { roomId });
});

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { participants: new Map(), messages: [], board: [] });
  }
  return rooms.get(roomId);
}

function publicParticipants(room) {
  return Array.from(room.participants.values()).map(({ socketId, ...participant }) => participant);
}

function leaveRoom(socket) {
  const { roomId, peerId } = socket.data || {};
  if (!roomId || !rooms.has(roomId)) return;
  const room = rooms.get(roomId);
  room.participants.delete(peerId);
  socket.to(roomId).emit("participant-left", peerId);
  io.to(roomId).emit("participants-updated", publicParticipants(room));
  if (!room.participants.size) rooms.delete(roomId);
  socket.data = {};
}

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, peerId, name, media }) => {
    if (!roomId || !peerId || !name) return;
    leaveRoom(socket);
    const safeName = String(name).trim().slice(0, 36) || "Guest";
    const room = getRoom(roomId);
    socket.join(roomId);
    socket.data = { roomId, peerId };
    room.participants.set(peerId, {
      id: peerId,
      socketId: socket.id,
      name: safeName,
      media: { audio: media?.audio !== false, video: media?.video !== false },
    });
    socket.emit("room-state", {
      participants: publicParticipants(room),
      messages: room.messages,
      board: room.board,
    });
    socket.to(roomId).emit("participant-joined", { id: peerId, name: safeName, media });
    io.to(roomId).emit("participants-updated", publicParticipants(room));
  });

  socket.on("chat-message", (value) => {
    const { roomId, peerId } = socket.data || {};
    const room = rooms.get(roomId);
    const participant = room?.participants.get(peerId);
    const text = String(value || "").trim().slice(0, 1000);
    if (!room || !participant || !text) return;
    const message = { id: randomUUID(), senderId: peerId, sender: participant.name, text, createdAt: Date.now() };
    room.messages.push(message);
    if (room.messages.length > 100) room.messages.shift();
    io.to(roomId).emit("chat-message", message);
  });

  socket.on("media-state", (media) => {
    const { roomId, peerId } = socket.data || {};
    const room = rooms.get(roomId);
    const participant = room?.participants.get(peerId);
    if (!participant) return;
    participant.media = { audio: media?.audio !== false, video: media?.video !== false };
    io.to(roomId).emit("participant-media", { id: peerId, media: participant.media });
  });

  socket.on("board-draw", (stroke) => {
    const { roomId } = socket.data || {};
    const room = rooms.get(roomId);
    if (!room || !stroke || room.board.length > 12000) return;
    const safeStroke = {
      from: { x: Number(stroke.from?.x), y: Number(stroke.from?.y) },
      to: { x: Number(stroke.to?.x), y: Number(stroke.to?.y) },
      color: String(stroke.color || "#5b5ce2").slice(0, 16),
      width: Math.min(Math.max(Number(stroke.width) || 3, 1), 30),
    };
    if (Object.values(safeStroke.from).some(Number.isNaN) || Object.values(safeStroke.to).some(Number.isNaN)) return;
    room.board.push(safeStroke);
    socket.to(roomId).emit("board-draw", safeStroke);
  });

  socket.on("board-clear", () => {
    const { roomId } = socket.data || {};
    const room = rooms.get(roomId);
    if (!room) return;
    room.board = [];
    io.to(roomId).emit("board-clear");
  });

  socket.on("disconnect", () => leaveRoom(socket));
});

server.listen(PORT, () => console.log(`Gatherly is running at http://localhost:${PORT}`));
