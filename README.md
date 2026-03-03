# Code Names – Multiplayer Web Game

A browser-based multiplayer implementation of the classic **Code Names** word game, built with Node.js, Express, and Socket.io.

## How to Play

Two teams (Red and Blue) compete to identify their secret agents on a 5×5 word grid.

- Each team has a **Spymaster** who knows which words belong to which team.
- The Spymaster gives a **one-word clue + a number** hinting at multiple cards.
- **Operatives** click cards they think match the clue.
- Reveal a wrong card and your turn ends (or you might help the other team!).
- Hit the **Assassin** card and your team loses instantly.
- First team to reveal all their cards wins.

## Server

The game server runs at:

```
http://141.72.176.152:8400
```

Open that address in your browser to play.

## Setup & Running (standalone)

```bash
npm install
npm start        # starts on port 8400 (or $PORT)
```

The port can be overridden via environment variable:

```bash
PORT=8401 npm start
```

## Integrating into an Existing Server

If you already have an Express + Socket.io server, require `game-server.js` and pass your `io` instance:

```js
const { Server } = require('socket.io');
const registerCodeNames = require('./game-server');

// your existing http server & io setup:
const io = new Server(httpServer, { cors: { origin: '*' } });

// mount the Code Names handlers:
registerCodeNames(io);

// serve the static frontend files from public/:
app.use(express.static(path.join(__dirname, 'public')));
```

## Project Structure

```
server.js        – Standalone Express + Socket.io entrypoint (port 8400)
game-server.js   – Reusable game logic module: registerHandlers(io)
words.js         – Word list (220 words)
public/
  index.html     – Game UI
  style.css      – Styling
  game.js        – Client-side game logic
```

## Game Rules Summary

| Cards | Count |
|-------|-------|
| Starting team | 9 |
| Other team | 8 |
| Neutral | 7 |
| Assassin | 1 |
| **Total** | **25** |

The starting team is chosen randomly each game.
