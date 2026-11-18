const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const QUESTIONS = require("./questions");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const rooms = new Map();
const MAX_PLAYERS = 12;
const QUESTION_SECONDS = 20;

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => res.json({ ok: true, name: "AniQuiz 2.0" }));

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (rooms.has(code));
  return code;
}
function cleanName(value) {
  return String(value || "").trim().replace(/[<>]/g, "").slice(0, 12);
}
function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    settings: room.settings,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, score: p.score, answered: p.answered
    })),
    questionIndex: room.questionIndex,
    totalQuestions: room.questions.length,
    question: room.status === "playing" ? room.currentQuestion : null,
    secondsLeft: room.secondsLeft,
    answerCounts: room.answerCounts || [0, 0, 0, 0],
    lastResult: room.lastResult || null
  };
}
function emitRoom(room) {
  io.to(room.code).emit("roomState", publicRoom(room));
}
function stopTimer(room) {
  if (room.timer) clearInterval(room.timer);
  room.timer = null;
}
function finishGame(room) {
  stopTimer(room);
  room.status = "finished";
  room.secondsLeft = 0;
  emitRoom(room);
}
function nextQuestion(room) {
  stopTimer(room);
  room.questionIndex += 1;
  if (room.questionIndex >= room.questions.length) return finishGame(room);
  room.players.forEach(p => { p.answered = false; p.lastAnswer = null; });
  room.currentQuestion = room.questions[room.questionIndex];
  room.secondsLeft = QUESTION_SECONDS;
  room.answerCounts = [0, 0, 0, 0];
  room.lastResult = null;
  room.status = "playing";
  emitRoom(room);
  room.timer = setInterval(() => {
    room.secondsLeft -= 1;
    if (room.secondsLeft <= 0) {
      stopTimer(room);
      room.lastResult = { message: "時間到！", correctIndex: room.currentQuestion.answer };
      emitRoom(room);
      setTimeout(() => {
        if (rooms.get(room.code) === room && room.status === "playing") nextQuestion(room);
      }, 2200);
    } else {
      io.to(room.code).emit("tick", room.secondsLeft);
    }
  }, 1000);
}
function chooseQuestions(settings) {
  let pool = QUESTIONS;
  if (settings.category && settings.category !== "全部動漫") {
    pool = pool.filter(q => q.category === settings.category || q.series === settings.category);
  }
  if (settings.difficulty && settings.difficulty !== "全部") {
    pool = pool.filter(q => q.difficulty === settings.difficulty);
  }
  if (!pool.length) pool = QUESTIONS;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(settings.questionCount || 10, shuffled.length));
}
io.on("connection", socket => {
  socket.on("createRoom", ({ name } = {}, callback = () => {}) => {
    const playerName = cleanName(name);
    if (!playerName) return callback({ ok: false, message: "請先輸入暱稱。" });
    const code = makeCode();
    const room = {
      code, hostId: socket.id, status: "lobby",
      settings: { category: "全部動漫", difficulty: "全部", questionCount: 10 },
      players: new Map(), questions: [], questionIndex: -1,
      currentQuestion: null, secondsLeft: QUESTION_SECONDS, timer: null
    };
    room.players.set(socket.id, { id: socket.id, name: playerName, score: 0, answered: false });
    rooms.set(code, room);
    socket.join(code);
    callback({ ok: true, code });
    emitRoom(room);
  });

  socket.on("joinRoom", ({ name, code } = {}, callback = () => {}) => {
    const playerName = cleanName(name);
    const roomCode = String(code || "").trim().toUpperCase();
    const room = rooms.get(roomCode);
    if (!playerName) return callback({ ok: false, message: "請先輸入暱稱。" });
    if (!room) return callback({ ok: false, message: "找不到這個房間，請確認房號。" });
    if (room.status !== "lobby") return callback({ ok: false, message: "遊戲已經開始，無法加入。" });
    if (room.players.size >= MAX_PLAYERS) return callback({ ok: false, message: "房間已滿，最多 12 人。" });
    if ([...room.players.values()].some(p => p.name.toLowerCase() === playerName.toLowerCase()))
      return callback({ ok: false, message: "這個暱稱已經有人使用，請換一個。" });
    room.players.set(socket.id, { id: socket.id, name: playerName, score: 0, answered: false });
    socket.join(roomCode);
    callback({ ok: true, code: roomCode });
    emitRoom(room);
  });

  socket.on("updateSettings", ({ code, category, difficulty, questionCount } = {}, callback = () => {}) => {
    const room = rooms.get(String(code || "").toUpperCase());
    if (!room || room.hostId !== socket.id || room.status !== "lobby")
      return callback({ ok: false, message: "只有房主能修改設定。" });
    const allowedCategories = ["全部動漫", ...new Set(QUESTIONS.map(q => q.category))];
    room.settings.category = allowedCategories.includes(category) ? category : "全部動漫";
    room.settings.difficulty = ["全部", "入門", "普通", "困難"].includes(difficulty) ? difficulty : "全部";
    room.settings.questionCount = Math.max(5, Math.min(20, Number(questionCount) || 10));
    callback({ ok: true });
    emitRoom(room);
  });

  socket.on("startGame", ({ code } = {}, callback = () => {}) => {
    const room = rooms.get(String(code || "").toUpperCase());
    if (!room || room.hostId !== socket.id || room.status !== "lobby")
      return callback({ ok: false, message: "目前無法開始遊戲。" });
    if (room.players.size < 1) return callback({ ok: false, message: "至少需要一位玩家。" });
    room.questions = chooseQuestions(room.settings);
    room.players.forEach(p => { p.score = 0; p.answered = false; });
    callback({ ok: true });
    nextQuestion(room);
  });

  socket.on("submitAnswer", ({ code, answer } = {}, callback = () => {}) => {
    const room = rooms.get(String(code || "").toUpperCase());
    const player = room && room.players.get(socket.id);
    if (!room || room.status !== "playing" || !player || player.answered)
      return callback({ ok: false, message: "目前不能作答。" });
    const index = Number(answer);
    if (![0, 1, 2, 3].includes(index)) return callback({ ok: false, message: "答案格式錯誤。" });
    player.answered = true;
    player.lastAnswer = index;
    room.answerCounts[index] += 1;
    const correct = index === room.currentQuestion.answer;
    if (correct) player.score += Math.max(10, room.secondsLeft);
    callback({ ok: true, correct, score: player.score });
    emitRoom(room);
    const everyoneAnswered = [...room.players.values()].every(p => p.answered);
    if (everyoneAnswered) {
      stopTimer(room);
      room.lastResult = { message: "大家都已完成作答！", correctIndex: room.currentQuestion.answer };
      emitRoom(room);
      setTimeout(() => {
        if (rooms.get(room.code) === room && room.status === "playing") nextQuestion(room);
      }, 2200);
    }
  });

  socket.on("leaveRoom", ({ code } = {}) => {
    const roomCode = String(code || "").toUpperCase();
    const room = rooms.get(roomCode);
    if (!room || !room.players.has(socket.id)) return;
    socket.leave(roomCode);
    room.players.delete(socket.id);
    if (!room.players.size) {
      stopTimer(room);
      rooms.delete(roomCode);
      return;
    }
    if (room.hostId === socket.id) room.hostId = room.players.keys().next().value;
    if (room.status === "playing" && [...room.players.values()].every(p => p.answered)) {
      stopTimer(room);
      room.lastResult = { message: "所有玩家已完成作答！", correctIndex: room.currentQuestion.answer };
      emitRoom(room);
      setTimeout(() => {
        if (rooms.get(room.code) === room && room.status === "playing") nextQuestion(room);
      }, 1800);
    } else emitRoom(room);
  });

  socket.on("disconnect", () => {
    for (const room of rooms.values()) {
      if (!room.players.has(socket.id)) continue;
      room.players.delete(socket.id);
      if (!room.players.size) {
        stopTimer(room);
        rooms.delete(room.code);
      } else {
        if (room.hostId === socket.id) room.hostId = room.players.keys().next().value;
        emitRoom(room);
      }
    }
  });
});

server.listen(PORT, () => console.log(`AniQuiz 2.0 running on port ${PORT}`));
