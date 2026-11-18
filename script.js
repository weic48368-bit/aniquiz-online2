function renderFinish(players) {
  showScreen("finishScreen");
  const sorted = [...players].sort((a,b) => b.score-a.score);
  $("finalRanking").innerHTML = sorted.map((p,i) => `<div class="rank-row"><span class="rank-num">${["🥇","🥈","🥉"][i] || (i+1)}</span><span class="rank-name">${escapeHtml(p.name)}</span><span class="rank-score">${p.score} 分</span></div>`).join("");
}const socket = io();
const $ = id => document.getElementById(id);
const screens = ["homeScreen", "lobbyScreen", "gameScreen", "finishScreen"];
let roomCode = null, isHost = false, roomState = null, hasAnswered = false, toastTimer = null;
function showScreen(id) { screens.forEach(s => $(s).classList.toggle("active", s === id)); }
function toast(message) {
  const el = $("toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2300);
}
function homeMessage(message) { $("homeMessage").textContent = message || ""; }
function lobbyMessage(message) { $("lobbyMessage").textContent = message || ""; }
function request(event, data) {
  return new Promise(resolve => socket.emit(event, data, resolve));
}
function currentName() { return $("nickname").value.trim(); }
async function createRoom() {
  homeMessage("");
  const result = await request("createRoom", { name: currentName() });
  if (!result || !result.ok) return homeMessage(result?.message || "建立房間失敗，請稍後再試。");
  roomCode = result.code; isHost = true; showScreen("lobbyScreen"); toast("房間建立成功！");
}
async function joinRoom() {
  homeMessage("");
  const result = await request("joinRoom", { name: currentName(), code: $("roomCodeInput").value });
  if (!result || !result.ok) return homeMessage(result?.message || "加入房間失敗。");
  roomCode = result.code; isHost = false; showScreen("lobbyScreen"); toast("成功加入房間！");
}
function renderPlayers(players) {
  $("playerCount").textContent = `${players.length} / 12`;
  $("playerList").innerHTML = players.map((p, i) => `<div class="player-chip"><span class="avatar">${escapeHtml(p.name.slice(0,1))}</span><span>${escapeHtml(p.name)}</span>${p.id === roomState.hostId ? '<span class="host-crown">♛</span>' : ''}</div>`).join("");
  $("gamePlayers").innerHTML = [...players].sort((a,b) => b.score-a.score).map(p => `<span class="compact-player">${escapeHtml(p.name)} <b>${p.score}</b></span>`).join("");
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function renderRoom(state) {
  roomState = state;
  isHost = state.hostId === socket.id;
  $("roomCodeDisplay").textContent = state.code;
  $("gameRoomCode").textContent = state.code;
  $("hostLabel").textContent = isHost ? "你是房主" : "一般玩家";
  $("settingsHint").textContent = isHost ? "你可以調整題目範圍、難度與題數。" : "等待房主調整設定並開始遊戲。";
  ["categorySelect","difficultySelect","questionCount"].forEach(id => $(id).disabled = !isHost || state.status !== "lobby");
  $("categorySelect").value = state.settings.category;
  $("difficultySelect").value = state.settings.difficulty;
  $("questionCount").value = String(state.settings.questionCount);
  $("startButton").style.display = isHost && state.status === "lobby" ? "block" : "none";
  renderPlayers(state.players);
  if (state.status === "lobby") showScreen("lobbyScreen");
  if (state.status === "playing") renderQuestion(state);
  if (state.status === "finished") renderFinish(state.players);
}
function renderQuestion(state) {
  showScreen("gameScreen");
  if (state.question) {
    const q = state.question;
    const key = `${state.questionIndex}:${q.question}`;
    if ($("questionText").dataset.key !== key) {
      $("questionText").dataset.key = key;
      hasAnswered = false;
      $("answerFeedback").textContent = "選擇你認為正確的答案";
      $("answerGrid").querySelectorAll("button").forEach((btn, i) => {
        btn.disabled = false; btn.className = "answer-option";
        btn.querySelector("b").textContent = q.options[i];
      });
    }
    $("questionText").textContent = q.question;
    $("questionNumber").textContent = `QUESTION ${String(state.questionIndex + 1).padStart(2,"0")} / ${state.totalQuestions}`;
    $("questionCategory").textContent = q.category;
    $("progressBar").style.width = `${((state.questionIndex + 1) / state.totalQuestions) * 100}%`;
    $("timerValue").textContent = state.secondsLeft;
    if (state.lastResult) revealAnswer(state.lastResult.correctIndex, state.lastResult.message);
  }
  renderPlayers(state.players);
}
function revealAnswer(correctIndex, message) {
  $("answerGrid").querySelectorAll("button").forEach((btn, i) => {
    btn.disabled = true;
    if (i === correctIndex) btn.classList.add("correct");
  });
  $("answerFeedback").textContent = `${message} 正確答案：${"ABCD"[correctIndex]}`;
}
function renderFinish(players) {
  showScreen("finishScreen");
  const sorted = [...players].sort((a,b) => b.score-a.score);

  $("finalRanking").innerHTML = sorted.map((p,i) => `<div class="rank-row"><span class="rank-num">${["🥇","🥈","🥉"][i] || (i+1)}</span><span class="rank-name">${escapeHtml(p.name)}</span><span class="rank-score">${p.score} 分</span></div>`).join("");

  $("restartButton").style.display = isHost ? "block" : "none";
}
