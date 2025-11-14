/**
 * Buzzer Game Server
 * WebSocket-based real-time buzzer game system
 */

const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

// Configuration
const PORT = process.env.PORT || 3001;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ============================================
// Game Management
// ============================================

const games = new Map();

function getNetworkIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (i.e. 127.0.0.1) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost'; // fallback
}

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

class Game {
  constructor(code, hostId) {
    this.code = code;
    this.hostId = hostId;
    this.participants = new Map();
    this.rounds = [];
    this.currentRound = null;
    this.roundStartTime = null;
  }

  addParticipant(id, name) {
    this.participants.set(id, {
      id,
      name,
      buzzHistory: [],
    });
  }

  removeParticipant(id) {
    this.participants.delete(id);
  }

  startRound() {
    this.currentRound = {
      roundNumber: this.rounds.length + 1,
      buzzes: [],
      startTime: Date.now(),
    };
    this.roundStartTime = Date.now();
  }

  buzz(participantId, timestamp) {
    if (!this.currentRound) return null;

    const participant = this.participants.get(participantId);
    if (!participant) return null;

    const buzzTime = timestamp - this.roundStartTime;
    const buzzData = {
      participantId,
      name: participant.name,
      time: buzzTime,
      timestamp,
    };

    this.currentRound.buzzes.push(buzzData);
    participant.buzzHistory.push({
      round: this.currentRound.roundNumber,
      time: buzzTime,
      position: this.currentRound.buzzes.length,
    });

    return buzzData;
  }

  endRound() {
    if (this.currentRound) {
      this.rounds.push(this.currentRound);
      this.currentRound = null;
      this.roundStartTime = null;
    }
  }

  getCurrentRoundLeaderboard() {
    if (!this.currentRound || this.currentRound.buzzes.length === 0) {
      return [];
    }
    
    // Sort buzzes by time (fastest first) - only players who buzzed in this round
    const sortedBuzzes = [...this.currentRound.buzzes].sort((a, b) => a.time - b.time);
    
    return sortedBuzzes.map((buzz, index) => ({
      name: buzz.name,
      time: buzz.time,
      position: index + 1
    }));
  }

  hasAllPlayersBuzzed() {
    if (!this.currentRound) return false;
    
    // Check if all participants have buzzed in this round
    const buzzedParticipantIds = new Set(this.currentRound.buzzes.map(b => b.participantId));
    return buzzedParticipantIds.size >= this.participants.size;
  }

  getLeaderboard() {
    // Return current round leaderboard for all contexts
    return this.getCurrentRoundLeaderboard();
  }

  getHistoryLeaderboard() {
    // Return overall game statistics for history page only
    const leaderboard = [];
    this.participants.forEach((participant) => {
      if (participant.buzzHistory.length > 0) {
        const avgTime =
          participant.buzzHistory.reduce((sum, b) => sum + b.time, 0) /
          participant.buzzHistory.length;
        const firstPlaces = participant.buzzHistory.filter(
          (b) => b.position === 1
        ).length;
        leaderboard.push({
          name: participant.name,
          avgTime: Math.round(avgTime),
          totalBuzzes: participant.buzzHistory.length,
          firstPlaces,
          rounds: this.rounds.length,
        });
      }
    });
    return leaderboard.sort((a, b) => a.avgTime - b.avgTime);
  }
}

// ============================================
// HTTP Server
// ============================================

const server = http.createServer((req, res) => {
  let filePath;
  let contentType = 'text/html';

  // Route handling
  if (req.url === '/' || req.url === '/index.html') {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  } else if (req.url === '/leaderboard' || req.url === '/leaderboard.html') {
    filePath = path.join(PUBLIC_DIR, 'leaderboard.html');
  } else if (req.url === '/history' || req.url === '/history.html') {
    filePath = path.join(PUBLIC_DIR, 'history.html');
  } else if (req.url.endsWith('.js')) {
    filePath = path.join(PUBLIC_DIR, req.url);
    contentType = 'application/javascript';
  } else if (req.url.endsWith('.css')) {
    filePath = path.join(PUBLIC_DIR, req.url);
    contentType = 'text/css';
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 - Not Found');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500 - Internal Server Error');
      console.error('Error reading file:', err);
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

// ============================================
// WebSocket Server
// ============================================

const wss = new WebSocket.Server({ server });
const connections = new Map();

wss.on('connection', (ws) => {
  const clientId = Math.random().toString(36).substring(2);
  connections.set(clientId, { ws, gameCode: null, isHost: false });

  console.log(`✅ Client connected: ${clientId}`);

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      handleMessage(clientId, data);
    } catch (err) {
      console.error('Error parsing message:', err);
    }
  });

  ws.on('close', () => {
    handleDisconnect(clientId);
  });
});

function handleMessage(clientId, data) {
  const conn = connections.get(clientId);
  if (!conn) return;

  switch (data.type) {
    case 'createGame':
      createGame(clientId, conn);
      break;
    case 'joinGame':
      joinGame(clientId, conn, data);
      break;
    case 'startRound':
      startRound(clientId, conn);
      break;
    case 'buzz':
      handleBuzz(clientId, conn);
      break;
    case 'endRound':
      endRound(clientId, conn);
      break;
    case 'requestUpdate':
      sendUpdate(clientId, conn);
      break;
    case 'requestHistory':
      sendHistory(clientId, conn);
      break;
  }
}

function createGame(clientId, conn) {
  const code = generateCode();
  const game = new Game(code, clientId);
  games.set(code, game);
  conn.gameCode = code;
  conn.isHost = true;

  conn.ws.send(
    JSON.stringify({
      type: 'gameCreated',
      code,
      clientId,
    })
  );
}

function joinGame(clientId, conn, data) {
  const game = games.get(data.code);
  if (!game) {
    conn.ws.send(
      JSON.stringify({
        type: 'error',
        message: 'Game not found',
      })
    );
    return;
  }

  // Check if this is a leaderboard display
  const isLeaderboardDisplay = data.name === 'Leaderboard Display';
  
  if (!isLeaderboardDisplay) {
    // Only add actual players to the game
    game.addParticipant(clientId, data.name);
  }
  
  conn.gameCode = data.code;
  conn.isHost = false;
  conn.isLeaderboardDisplay = isLeaderboardDisplay;

  conn.ws.send(
    JSON.stringify({
      type: 'joinedGame',
      code: data.code,
      clientId,
    })
  );

  if (!isLeaderboardDisplay) {
    broadcastToGame(data.code, {
      type: 'participantJoined',
      participants: Array.from(game.participants.values()),
    });
  }
}

function startRound(clientId, conn) {
  if (!conn.isHost) return;
  const game = games.get(conn.gameCode);
  if (!game) return;

  game.startRound();
  broadcastToGame(conn.gameCode, {
    type: 'roundStarted',
    roundNumber: game.currentRound.roundNumber,
  });
}

function handleBuzz(clientId, conn) {
  const game = games.get(conn.gameCode);
  if (!game || !game.currentRound) return;

  const buzzData = game.buzz(clientId, Date.now());
  if (buzzData) {
    broadcastToGame(conn.gameCode, {
      type: 'buzzed',
      buzz: buzzData,
      position: game.currentRound.buzzes.length,
      currentRoundLeaderboard: game.getCurrentRoundLeaderboard(),
    });

    // Check if all players have buzzed and auto-end round
    if (game.hasAllPlayersBuzzed()) {
      setTimeout(() => {
        game.endRound();
        const leaderboard = game.getLeaderboard();
        broadcastToGame(conn.gameCode, {
          type: 'roundEnded',
          leaderboard,
          autoEnded: true,
        });
      }, 1000); // 1 second delay to show final results
    }
  }
}

function endRound(clientId, conn) {
  if (!conn.isHost) return;
  const game = games.get(conn.gameCode);
  if (!game) return;

  game.endRound();
  const leaderboard = game.getLeaderboard();
  broadcastToGame(conn.gameCode, {
    type: 'roundEnded',
    leaderboard,
  });
}

function sendUpdate(clientId, conn) {
  const game = games.get(conn.gameCode);
  if (!game) return;

  conn.ws.send(
    JSON.stringify({
      type: 'gameUpdate',
      participants: Array.from(game.participants.values()),
      leaderboard: game.getLeaderboard(),
      currentRound: game.currentRound,
      isHost: conn.isHost,
    })
  );
}

function sendHistory(clientId, conn) {
  const game = games.get(conn.gameCode);
  if (!game) return;

  conn.ws.send(
    JSON.stringify({
      type: 'historyUpdate',
      historyLeaderboard: game.getHistoryLeaderboard(),
      rounds: game.rounds,
      totalRounds: game.rounds.length,
      gameCode: game.code,
    })
  );
}

function handleDisconnect(clientId) {
  const conn = connections.get(clientId);
  if (conn && conn.gameCode) {
    const game = games.get(conn.gameCode);
    if (game) {
      // Only remove from participants if not a leaderboard display
      if (!conn.isLeaderboardDisplay) {
        game.removeParticipant(clientId);
        broadcastToGame(conn.gameCode, {
          type: 'participantLeft',
          participants: Array.from(game.participants.values()),
        });
      }

      // Clean up empty games (only count actual players, not leaderboard displays)
      if (game.participants.size === 0) {
        games.delete(conn.gameCode);
      }
    }
  }
  connections.delete(clientId);
  console.log(`❌ Client disconnected: ${clientId}`);
}

function broadcastToGame(gameCode, message) {
  connections.forEach((conn) => {
    if (conn.gameCode === gameCode && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify(message));
    }
  });
}

// ============================================
// Start Server
// ============================================

server.listen(PORT, () => {
  const networkIP = getNetworkIP();
  
  console.log('╔════════════════════════════════════════╗');
  console.log('║       🎯 BUZZER GAME SERVER           ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`\n🌐 Local access:    http://localhost:${PORT}`);
  console.log(`📱 Network access:  http://${networkIP}:${PORT}`);
  console.log(`📊 Leaderboard:     http://${networkIP}:${PORT}/leaderboard`);
  console.log(`📈 Game History:    http://${networkIP}:${PORT}/history`);
  console.log(`\n💡 Share the network address with others on your WiFi!`);
  console.log(`⚡ WebSocket ready\n`);
});
