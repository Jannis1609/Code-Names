'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const WORDS = require('./words');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// In-memory rooms store
const rooms = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createBoard(startingTeam) {
  const words = shuffle(WORDS).slice(0, 25);
  const assignments = [];
  const firstCount = 9;
  const secondCount = 8;
  const secondTeam = startingTeam === 'red' ? 'blue' : 'red';

  for (let i = 0; i < firstCount; i++) assignments.push(startingTeam);
  for (let i = 0; i < secondCount; i++) assignments.push(secondTeam);
  for (let i = 0; i < 7; i++) assignments.push('neutral');
  assignments.push('assassin');

  const shuffledAssignments = shuffle(assignments);
  return words.map((word, i) => ({
    word,
    team: shuffledAssignments[i],
    revealed: false,
  }));
}

function getPublicState(room, socketId) {
  const player = room.players[socketId];
  const isSpymaster = player && player.role === 'spymaster';

  const board = room.board
    ? room.board.map(card => ({
        word: card.word,
        revealed: card.revealed,
        team: card.revealed ? card.team : (isSpymaster ? card.team : null),
        isAssassin: card.revealed ? card.team === 'assassin' : (isSpymaster ? card.team === 'assassin' : false),
      }))
    : null;

  return {
    roomCode: room.roomCode,
    players: room.players,
    board,
    currentTeam: room.currentTeam,
    phase: room.phase,
    clue: room.clue,
    guessesLeft: room.guessesLeft,
    scores: room.scores,
    winner: room.winner,
    totalCards: room.totalCards,
  };
}

function broadcastRoomState(room) {
  Object.keys(room.players).forEach(sid => {
    const socket = io.sockets.sockets.get(sid);
    if (socket) {
      socket.emit('room-updated', getPublicState(room, sid));
    }
  });
}

function checkWin(room) {
  const { scores, totalCards } = room;
  if (scores.red >= totalCards.red) {
    room.phase = 'game-over';
    room.winner = 'red';
    return true;
  }
  if (scores.blue >= totalCards.blue) {
    room.phase = 'game-over';
    room.winner = 'blue';
    return true;
  }
  return false;
}

function switchTurn(room) {
  room.currentTeam = room.currentTeam === 'red' ? 'blue' : 'red';
  room.phase = 'spymaster-clue';
  room.clue = null;
  room.guessesLeft = 0;
}

io.on('connection', socket => {
  console.log('Client connected:', socket.id);

  socket.on('create-room', ({ name }) => {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return socket.emit('error', { message: 'Invalid name.' });
    }
    let roomCode;
    do { roomCode = generateRoomCode(); } while (rooms[roomCode]);

    const room = {
      roomCode,
      players: {},
      board: null,
      currentTeam: null,
      phase: 'lobby',
      clue: null,
      guessesLeft: 0,
      scores: { red: 0, blue: 0 },
      winner: null,
      totalCards: { red: 0, blue: 0 },
    };
    room.players[socket.id] = { name: name.trim(), team: null, role: null };
    rooms[roomCode] = room;
    socket.join(roomCode);
    socket.emit('room-joined', { roomCode });
    broadcastRoomState(room);
  });

  socket.on('join-room', ({ name, roomCode }) => {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return socket.emit('error', { message: 'Invalid name.' });
    }
    const code = (roomCode || '').toString().trim().toUpperCase();
    const room = rooms[code];
    if (!room) return socket.emit('error', { message: 'Room not found.' });
    if (room.phase !== 'lobby') return socket.emit('error', { message: 'Game already in progress.' });

    room.players[socket.id] = { name: name.trim(), team: null, role: null };
    socket.join(code);
    socket.emit('room-joined', { roomCode: code });
    broadcastRoomState(room);
  });

  socket.on('choose-team-role', ({ team, role }) => {
    const roomCode = [...socket.rooms].find(r => r !== socket.id);
    if (!roomCode) return socket.emit('error', { message: 'Not in a room.' });
    const room = rooms[roomCode];
    if (!room) return socket.emit('error', { message: 'Room not found.' });
    if (room.phase !== 'lobby') return socket.emit('error', { message: 'Cannot change role during game.' });
    if (!['red', 'blue'].includes(team)) return socket.emit('error', { message: 'Invalid team.' });
    if (!['spymaster', 'operative'].includes(role)) return socket.emit('error', { message: 'Invalid role.' });

    // Only one spymaster per team
    if (role === 'spymaster') {
      const existingSpymaster = Object.entries(room.players).find(
        ([sid, p]) => sid !== socket.id && p.team === team && p.role === 'spymaster'
      );
      if (existingSpymaster) return socket.emit('error', { message: `${team} team already has a Spymaster.` });
    }

    room.players[socket.id] = { ...room.players[socket.id], team, role };
    broadcastRoomState(room);
  });

  socket.on('start-game', () => {
    const roomCode = [...socket.rooms].find(r => r !== socket.id);
    if (!roomCode) return socket.emit('error', { message: 'Not in a room.' });
    const room = rooms[roomCode];
    if (!room) return socket.emit('error', { message: 'Room not found.' });
    if (room.phase !== 'lobby') return socket.emit('error', { message: 'Game already started.' });

    const players = Object.values(room.players);
    const hasRedSpymaster = players.some(p => p.team === 'red' && p.role === 'spymaster');
    const hasBlueSpymaster = players.some(p => p.team === 'blue' && p.role === 'spymaster');
    const hasRedOperative = players.some(p => p.team === 'red' && p.role === 'operative');
    const hasBlueOperative = players.some(p => p.team === 'blue' && p.role === 'operative');

    if (!hasRedSpymaster || !hasBlueSpymaster) {
      return socket.emit('error', { message: 'Each team needs a Spymaster.' });
    }
    if (!hasRedOperative || !hasBlueOperative) {
      return socket.emit('error', { message: 'Each team needs at least one Operative.' });
    }

    const startingTeam = Math.random() < 0.5 ? 'red' : 'blue';
    room.board = createBoard(startingTeam);
    room.currentTeam = startingTeam;
    room.phase = 'spymaster-clue';
    room.clue = null;
    room.guessesLeft = 0;
    room.scores = { red: 0, blue: 0 };
    room.winner = null;
    room.totalCards = {
      red: startingTeam === 'red' ? 9 : 8,
      blue: startingTeam === 'blue' ? 9 : 8,
    };

    broadcastRoomState(room);
  });

  socket.on('give-clue', ({ word, count }) => {
    const roomCode = [...socket.rooms].find(r => r !== socket.id);
    if (!roomCode) return socket.emit('error', { message: 'Not in a room.' });
    const room = rooms[roomCode];
    if (!room) return socket.emit('error', { message: 'Room not found.' });

    const player = room.players[socket.id];
    if (!player) return socket.emit('error', { message: 'Player not found.' });
    if (room.phase !== 'spymaster-clue') return socket.emit('error', { message: 'Not time for a clue.' });
    if (player.team !== room.currentTeam) return socket.emit('error', { message: 'Not your team\'s turn.' });
    if (player.role !== 'spymaster') return socket.emit('error', { message: 'Only Spymasters can give clues.' });

    const clueWord = (word || '').toString().trim();
    if (!clueWord || clueWord.includes(' ')) return socket.emit('error', { message: 'Clue must be a single word.' });
    const clueCount = parseInt(count, 10);
    if (isNaN(clueCount) || clueCount < 0 || clueCount > 9) {
      return socket.emit('error', { message: 'Count must be 0-9.' });
    }

    room.clue = { word: clueWord.toUpperCase(), count: clueCount };
    room.guessesLeft = clueCount === 0 ? 999 : clueCount + 1; // +1 allows one bonus guess
    room.phase = 'operative-guess';
    broadcastRoomState(room);
  });

  socket.on('reveal-card', ({ index }) => {
    const roomCode = [...socket.rooms].find(r => r !== socket.id);
    if (!roomCode) return socket.emit('error', { message: 'Not in a room.' });
    const room = rooms[roomCode];
    if (!room) return socket.emit('error', { message: 'Room not found.' });

    const player = room.players[socket.id];
    if (!player) return socket.emit('error', { message: 'Player not found.' });
    if (room.phase !== 'operative-guess') return socket.emit('error', { message: 'Not time to guess.' });
    if (player.team !== room.currentTeam) return socket.emit('error', { message: 'Not your team\'s turn.' });
    if (player.role !== 'operative') return socket.emit('error', { message: 'Only Operatives can reveal cards.' });

    const idx = parseInt(index, 10);
    if (isNaN(idx) || idx < 0 || idx >= 25) return socket.emit('error', { message: 'Invalid card index.' });
    const card = room.board[idx];
    if (card.revealed) return socket.emit('error', { message: 'Card already revealed.' });

    card.revealed = true;

    if (card.team === 'assassin') {
      room.phase = 'game-over';
      room.winner = room.currentTeam === 'red' ? 'blue' : 'red';
      return broadcastRoomState(room);
    }

    if (card.team === room.currentTeam) {
      room.scores[room.currentTeam]++;
      if (checkWin(room)) return broadcastRoomState(room);
      if (room.guessesLeft !== 999) room.guessesLeft--;
      if (room.guessesLeft <= 0) switchTurn(room);
    } else {
      // Wrong card: if it belongs to other team, score for them
      if (card.team === 'red' || card.team === 'blue') {
        room.scores[card.team]++;
        if (checkWin(room)) return broadcastRoomState(room);
      }
      switchTurn(room);
    }

    broadcastRoomState(room);
  });

  socket.on('end-turn', () => {
    const roomCode = [...socket.rooms].find(r => r !== socket.id);
    if (!roomCode) return socket.emit('error', { message: 'Not in a room.' });
    const room = rooms[roomCode];
    if (!room) return socket.emit('error', { message: 'Room not found.' });

    const player = room.players[socket.id];
    if (!player) return socket.emit('error', { message: 'Player not found.' });
    if (room.phase !== 'operative-guess') return socket.emit('error', { message: 'Cannot end turn now.' });
    if (player.team !== room.currentTeam) return socket.emit('error', { message: 'Not your team\'s turn.' });
    if (player.role !== 'operative') return socket.emit('error', { message: 'Only Operatives can end the turn.' });

    switchTurn(room);
    broadcastRoomState(room);
  });

  socket.on('play-again', () => {
    const roomCode = [...socket.rooms].find(r => r !== socket.id);
    if (!roomCode) return socket.emit('error', { message: 'Not in a room.' });
    const room = rooms[roomCode];
    if (!room) return socket.emit('error', { message: 'Room not found.' });
    if (room.phase !== 'game-over') return socket.emit('error', { message: 'Game not over yet.' });

    room.board = null;
    room.currentTeam = null;
    room.phase = 'lobby';
    room.clue = null;
    room.guessesLeft = 0;
    room.scores = { red: 0, blue: 0 };
    room.winner = null;
    room.totalCards = { red: 0, blue: 0 };

    broadcastRoomState(room);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    // Remove player from all rooms they were in
    Object.values(rooms).forEach(room => {
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        // Clean up empty rooms
        if (Object.keys(room.players).length === 0) {
          delete rooms[room.roomCode];
        } else {
          broadcastRoomState(room);
        }
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Code Names server running on http://localhost:${PORT}`);
});
