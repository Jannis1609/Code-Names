'use strict';

// Connect to the server specified in the ?server= query param, or the current origin.
// Example: http://141.72.176.152:8400/?server=http://141.72.176.152:8400
const serverUrl = new URLSearchParams(window.location.search).get('server') || undefined;
const socket = io(serverUrl);

let mySocketId = null;
let currentRoom = null;  // full game state from server
let myRoomCode  = null;

// ── Helpers ────────────────────────────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

let toastTimer = null;
function showToast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (isError ? ' error' : '');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

function myPlayer() {
  if (!currentRoom || !mySocketId) return null;
  return currentRoom.players[mySocketId] || null;
}

// ── Lobby ───────────────────────────────────────────────────────────────────

document.getElementById('btn-create-room').addEventListener('click', () => {
  const name = document.getElementById('player-name').value.trim();
  if (!name) return showToast('Please enter your name.', true);
  socket.emit('create-room', { name });
});

document.getElementById('btn-join-room').addEventListener('click', () => {
  const name = document.getElementById('player-name').value.trim();
  const roomCode = document.getElementById('room-code-input').value.trim().toUpperCase();
  if (!name)     return showToast('Please enter your name.', true);
  if (!roomCode) return showToast('Please enter a room code.', true);
  socket.emit('join-room', { name, roomCode });
});

document.getElementById('player-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-create-room').click();
});

document.getElementById('room-code-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-join-room').click();
});

// ── Waiting Room ────────────────────────────────────────────────────────────

document.getElementById('btn-copy-code').addEventListener('click', () => {
  navigator.clipboard.writeText(myRoomCode).then(() => showToast('Room code copied!'));
});

document.querySelectorAll('.btn-role').forEach(btn => {
  btn.addEventListener('click', () => {
    const team = btn.dataset.team;
    const role = btn.dataset.role;
    socket.emit('choose-team-role', { team, role });
  });
});

document.getElementById('btn-start-game').addEventListener('click', () => {
  socket.emit('start-game');
});

// ── Game controls ───────────────────────────────────────────────────────────

document.getElementById('btn-give-clue').addEventListener('click', () => {
  const word  = document.getElementById('clue-input').value.trim();
  const count = document.getElementById('clue-count-input').value;
  if (!word) return showToast('Enter a clue word.', true);
  socket.emit('give-clue', { word, count });
  document.getElementById('clue-input').value = '';
});

document.getElementById('clue-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-give-clue').click();
});

document.getElementById('btn-end-turn').addEventListener('click', () => {
  socket.emit('end-turn');
});

document.getElementById('btn-play-again').addEventListener('click', () => {
  socket.emit('play-again');
});

// ── Rendering ───────────────────────────────────────────────────────────────

function renderWaitingRoom(state) {
  document.getElementById('display-room-code').textContent = state.roomCode;
  document.getElementById('btn-copy-code').onclick = () => {
    navigator.clipboard.writeText(state.roomCode).then(() => showToast('Room code copied!'));
  };

  const lists = {
    'red-spymaster':  [],
    'red-operative':  [],
    'blue-spymaster': [],
    'blue-operative': [],
    'unassigned':     [],
  };

  Object.entries(state.players).forEach(([sid, p]) => {
    const isMe = sid === mySocketId;
    const label = p.name + (isMe ? ' (You)' : '');
    if (p.team && p.role) {
      lists[`${p.team}-${p.role}`].push({ label, isMe });
    } else {
      lists['unassigned'].push({ label, isMe });
    }
  });

  ['red-spymaster', 'red-operative', 'blue-spymaster', 'blue-operative'].forEach(key => {
    const ul = document.getElementById(`${key}-list`);
    ul.innerHTML = '';
    lists[key].forEach(({ label, isMe }) => {
      const li = document.createElement('li');
      li.textContent = label;
      if (isMe) li.classList.add('me');
      ul.appendChild(li);
    });
  });

  const unassignedUl = document.getElementById('unassigned-list');
  unassignedUl.innerHTML = '';
  lists['unassigned'].forEach(({ label, isMe }) => {
    const li = document.createElement('li');
    li.textContent = label;
    if (isMe) li.classList.add('me');
    unassignedUl.appendChild(li);
  });

  // Start game readiness check
  const players = Object.values(state.players);
  const has = (team, role) => players.some(p => p.team === team && p.role === role);
  const ready = has('red','spymaster') && has('blue','spymaster') &&
                has('red','operative') && has('blue','operative');

  const statusEl = document.getElementById('start-status');
  const startBtn = document.getElementById('btn-start-game');
  if (ready) {
    statusEl.textContent = 'Teams are ready! Press Start Game.';
    startBtn.disabled = false;
  } else {
    statusEl.textContent = 'Each team needs at least 1 Spymaster and 1 Operative.';
    startBtn.disabled = true;
  }
}

function renderGameScreen(state) {
  const me = myPlayer();

  // Scores
  document.getElementById('score-red').textContent  = `Red: ${state.scores.red}/${state.totalCards.red}`;
  document.getElementById('score-blue').textContent = `Blue: ${state.scores.blue}/${state.totalCards.blue}`;

  // Turn indicator
  const turnEl = document.getElementById('turn-indicator');
  const phaseLabel = state.phase === 'spymaster-clue' ? 'Spymaster\'s turn' :
                     state.phase === 'operative-guess' ? 'Operatives guessing' : '';
  turnEl.textContent = state.currentTeam
    ? `${state.currentTeam.charAt(0).toUpperCase() + state.currentTeam.slice(1)} – ${phaseLabel}`
    : '';
  turnEl.className = 'turn-indicator ' + (state.currentTeam || '');

  // Room code
  document.getElementById('game-room-code').textContent = state.roomCode;

  // Board
  const board = document.getElementById('game-board');
  board.innerHTML = '';
  const isOperative = me && me.role === 'operative';
  const isSpymaster  = me && me.role === 'spymaster';
  const isMyTurn = me && me.team === state.currentTeam;
  const canClick = isOperative && isMyTurn && state.phase === 'operative-guess';

  (state.board || []).forEach((card, idx) => {
    const tile = document.createElement('div');
    tile.classList.add('card-tile');
    tile.textContent = card.word;

    if (card.revealed) {
      tile.classList.add(`revealed-${card.team}`);
    } else if (isSpymaster) {
      // Spymaster sees color-coded tint but cannot click cards
      const teamClass = card.team === 'assassin' ? 'spy-assassin' :
                        card.team === 'neutral'   ? 'spy-neutral'  :
                        `spy-${card.team}`;
      tile.classList.add(teamClass);
    } else {
      tile.classList.add('unrevealed');
      if (canClick) {
        tile.classList.add('clickable');
        tile.addEventListener('click', () => socket.emit('reveal-card', { index: idx }));
      }
    }

    board.appendChild(tile);
  });

  // Clue display
  const clueDisplay = document.getElementById('clue-display');
  if (state.clue) {
    clueDisplay.classList.remove('hidden');
    document.getElementById('clue-word').textContent  = state.clue.word;
    document.getElementById('clue-count').textContent = `Count: ${state.clue.count === 0 ? '∞' : state.clue.count}`;
    const guessesLeft = state.guessesLeft;
    document.getElementById('guesses-left').textContent = guessesLeft === null || guessesLeft === undefined ? '' :
      (guessesLeft >= 999 ? 'Unlimited guesses' : `Guesses left: ${guessesLeft}`);
  } else {
    clueDisplay.classList.add('hidden');
  }

  // Action panels
  const spyPanel = document.getElementById('spymaster-panel');
  const opPanel  = document.getElementById('operative-panel');
  spyPanel.classList.add('hidden');
  opPanel.classList.add('hidden');

  if (state.phase === 'spymaster-clue' && isSpymaster && isMyTurn) {
    spyPanel.classList.remove('hidden');
  } else if (state.phase === 'operative-guess' && isOperative && isMyTurn) {
    opPanel.classList.remove('hidden');
  }

  // Sidebar player lists
  const redList  = document.getElementById('sidebar-red-list');
  const blueList = document.getElementById('sidebar-blue-list');
  redList.innerHTML  = '';
  blueList.innerHTML = '';

  Object.entries(state.players).forEach(([sid, p]) => {
    if (!p.team) return;
    const li = document.createElement('li');
    li.textContent = `${p.name} (${p.role === 'spymaster' ? '🕵️' : '🔍'})`;
    if (sid === mySocketId) li.classList.add('me');
    (p.team === 'red' ? redList : blueList).appendChild(li);
  });

  // Game over overlay
  const overlay = document.getElementById('game-over-overlay');
  if (state.phase === 'game-over' && state.winner) {
    overlay.classList.remove('hidden');
    const title = document.getElementById('game-over-title');
    const sub   = document.getElementById('game-over-subtitle');
    title.textContent = `${state.winner.toUpperCase()} WINS!`;
    title.style.color = state.winner === 'red' ? 'var(--red-light)' : 'var(--blue-light)';
    sub.textContent   = me && me.team === state.winner ? '🎉 Your team won!' : '😔 Your team lost.';
  } else {
    overlay.classList.add('hidden');
  }
}

// ── Socket events ───────────────────────────────────────────────────────────

socket.on('connect', () => {
  mySocketId = socket.id;
});

socket.on('room-joined', ({ roomCode }) => {
  myRoomCode = roomCode;
  showScreen('screen-waiting');
});

socket.on('room-updated', state => {
  currentRoom = state;
  if (state.phase === 'lobby') {
    showScreen('screen-waiting');
    renderWaitingRoom(state);
  } else {
    showScreen('screen-game');
    renderGameScreen(state);
  }
});

socket.on('error', ({ message }) => {
  showToast(message, true);
});
