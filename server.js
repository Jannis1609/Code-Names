'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const registerHandlers = require('./game-server');

const app = express();
const server = http.createServer(app);

// Allow cross-origin connections so browsers on other machines can reach this server.
// The game has no sensitive user data; all state is public within a room.
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(express.static(path.join(__dirname, 'public')));

// Register all Code Names Socket.io handlers
registerHandlers(io);

const PORT = process.env.PORT || 8400;
server.listen(PORT, () => {
  console.log(`Code Names server running on http://localhost:${PORT}`);
});
