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

## Setup & Running

```bash
npm install
npm start
```

Then open **http://localhost:3000** in your browser.

## Project Structure

```
server.js        – Express + Socket.io game server
words.js         – Word list (200+ words)
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
