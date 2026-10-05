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

// Virtual/container interfaces whose addresses are unreachable from participant devices.
const VIRTUAL_IFACE = /^(lo$|docker|br-|br\d|veth|virbr|vmnet|vboxnet|tun|tap|wg|zt|cali|flannel|cni|dummy|apparmor|azvpn|bond-slave)/;

function isPrivateIPv4(addr) {
  return (
    /^10\./.test(addr) ||
    /^192\.168\./.test(addr) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(addr)
  );
}

function getNetworkIP() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const name of Object.keys(interfaces)) {
    if (VIRTUAL_IFACE.test(name)) continue;
    for (const iface of interfaces[name] || []) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      if (!isPrivateIPv4(iface.address)) continue;
      // Prefer WiFi (participants are on the venue network), then wired.
      const score = /^wl/.test(name) ? 0 : /^(en|eth|eno|ens|enp)/.test(name) ? 1 : 2;
      candidates.push({ name, address: iface.address, score });
    }
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates.length ? candidates[0].address : 'localhost';
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
    this.roundCounter = 0;
    this.roundEligibleIds = new Set();
  }

  addParticipant(id, name) {
    this.participants.set(id, {
      id,
      name,
      buzzHistory: [],
      connected: true,
    });
  }

  removeParticipant(id) {
    this.participants.delete(id);
  }

  startRound() {
    // Monotonic so a round number can never be reused within a game.
    this.roundCounter += 1;
    this.currentRound = {
      roundNumber: this.roundCounter,
      buzzes: [],
      startTime: Date.now(),
    };
    this.roundStartTime = Date.now();
    // Snapshot the roster so the auto-end check is not thrown off by
    // participants joining or disconnecting mid-round. Offline participants
    // should not hold the round open.
    this.roundEligibleIds = new Set(
      [...this.participants.entries()]
        .filter(([, p]) => p.connected !== false)
        .map(([id]) => id)
    );
  }

  buzz(participantId, timestamp) {
    if (!this.currentRound) return null;

    const participant = this.participants.get(participantId);
    if (!participant) return null;

    // One buzz per participant per round.
    const alreadyBuzzed = this.currentRound.buzzes.some(
      (b) => b.participantId === participantId
    );
    if (alreadyBuzzed) return null;

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
      this.roundEligibleIds = new Set();
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

    // Only count players who were in the round AND are still connected.
    // A player who drops out mid-round must not block the auto-end.
    const eligible = [...this.roundEligibleIds].filter((id) => {
      const participant = this.participants.get(id);
      return participant && participant.connected !== false;
    });
    if (eligible.length === 0) return false;

    const buzzedParticipantIds = new Set(
      this.currentRound.buzzes.map((b) => b.participantId)
    );
    return eligible.every((id) => buzzedParticipantIds.has(id));
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
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/' || pathname === '/index.html') {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  } else if (pathname === '/leaderboard' || pathname === '/leaderboard.html') {
    filePath = path.join(PUBLIC_DIR, 'leaderboard.html');
  } else if (pathname === '/history' || pathname === '/history.html') {
    filePath = path.join(PUBLIC_DIR, 'history.html');
  } else if (pathname.endsWith('.js')) {
    filePath = path.join(PUBLIC_DIR, pathname);
    contentType = 'application/javascript';
  } else if (pathname.endsWith('.css')) {
    filePath = path.join(PUBLIC_DIR, pathname);
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

const HEARTBEAT_INTERVAL = 30000;

wss.on('connection', (ws) => {
  const clientId = Math.random().toString(36).substring(2);
  ws.isAlive = true;
  connections.set(clientId, { ws, gameCode: null, isHost: false, name: null });

  console.log(`✅ Client connected: ${clientId}`);

  ws.on('pong', () => {
    ws.isAlive = true;
  });

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

  ws.on('error', () => {
    handleDisconnect(clientId);
  });
});

// Reap sockets the network silently dropped (idle NAT / WiFi timeouts). Without
// this, both ends believe a dead connection is still OPEN and buzzes vanish.
const heartbeatTimer = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log('💀 Terminating unresponsive socket');
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

wss.on('close', () => clearInterval(heartbeatTimer));

function handleMessage(clientId, data) {
  const conn = connections.get(clientId);
  if (!conn) return;

  switch (data.type) {
    case 'createGame':
      createGame(clientId, conn, data);
      break;
    case 'joinGame':
      joinGame(clientId, conn, data);
      break;
    case 'startRound':
      startRound(clientId, conn);
      break;
    case 'buzz':
      handleBuzz(clientId, conn, data);
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
    case 'leaveGame':
      detachParticipant(clientId);
      connections.delete(clientId);
      if (conn.gameCode) cleanupGameIfEmpty(conn.gameCode);
      break;
    case 'ping':
      conn.ws.send(JSON.stringify({ type: 'pong', serverTime: Date.now() }));
      break;
  }
}

/**
 * A reconnecting client is a NEW connection with a NEW clientId, but it is the same
 * human on the same device. Retire its previous connection so the roster does not
 * keep a phantom participant that can never buzz (and would block auto-end).
 */
function claimIdentity(clientId, previousClientId) {
  if (!previousClientId || previousClientId === clientId) return;
  const prev = connections.get(previousClientId);
  if (!prev) return;

  // Keep the participant record alive so iOS reloads do not visibly un-join
  // and re-add the name. The previous socket must have its close handler
  // ignored; deleting it first makes the close event see `undefined`.
  connections.delete(previousClientId);
  try {
    prev.ws.close(4000, 'Replaced by reconnect');
  } catch (_) {
    /* already gone */
  }
}

function createGame(clientId, conn, data = {}) {
  claimIdentity(clientId, data.clientId);

  const requested = typeof data.code === 'string' ? data.code.trim().toUpperCase() : '';
  let code = requested;
  let game = code ? games.get(code) : undefined;

  if (game) {
    // Host reconnect: rebind to the live game instead of wiping its roster.
    game.hostId = clientId;
  } else {
    if (!code || games.has(code)) code = generateCode();
    game = new Game(code, clientId);
    games.set(code, game);
  }

  conn.gameCode = code;
  conn.isHost = true;
  conn.name = 'Host';

  conn.ws.send(
    JSON.stringify({
      type: 'gameCreated',
      code,
      clientId,
      serverTime: Date.now(),
    })
  );
}

function joinGame(clientId, conn, data) {
  claimIdentity(clientId, data.clientId);

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

  // Check if this is a leaderboard display or history viewer
  const isLeaderboardDisplay = data.name === 'Leaderboard Display';
  const isHistoryViewer = data.name === 'History Viewer';
  const isDisplayClient = isLeaderboardDisplay || isHistoryViewer;
  
  if (!isDisplayClient) {
    const previousClientId = typeof data.clientId === 'string' ? data.clientId : '';
    const previous = previousClientId ? game.participants.get(previousClientId) : null;

    if (previous) {
      // Rejoin after a sleep/reload: keep the player’s seat and history instead of
      // visually removing them then adding “Alice” again under a fresh id.
      game.participants.delete(previousClientId);
      previous.id = clientId;
      previous.name = data.name || previous.name;
      previous.connected = true;
      game.participants.set(clientId, previous);

      if (game.roundEligibleIds.has(previousClientId)) {
        game.roundEligibleIds.delete(previousClientId);
        game.roundEligibleIds.add(clientId);
      }
      const migrate = (round) => {
        if (!round?.buzzes) return;
        round.buzzes.forEach((b) => {
          if (b.participantId === previousClientId) b.participantId = clientId;
        });
      };
      migrate(game.currentRound);
      game.rounds.forEach(migrate);
    } else {
      // Only add actual players to the game
      game.addParticipant(clientId, data.name);
    }
  }
  
  conn.gameCode = data.code;
  conn.isHost = false;
  conn.name = data.name;
  conn.isLeaderboardDisplay = isLeaderboardDisplay;
  conn.isHistoryViewer = isHistoryViewer;

  conn.ws.send(
    JSON.stringify({
      type: 'joinedGame',
      code: data.code,
      clientId,
      serverTime: Date.now(),
    })
  );

  if (!isDisplayClient) {
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
    serverTime: Date.now(),
  });
}

const MAX_CLIENT_CLOCK_SKEW = 5 * 60 * 1000;

function resolveBuzzTimestamp(data) {
  const serverNow = Date.now();
  const clientTime = Number(data.timestamp);

  // Trust the client's clock-corrected stamp when plausible, so a buzz reflects the
  // actual tap instead of server arrival (which adds a full RTT of venue WiFi
  // latency plus mobile-network latency on every phone).
  if (
    Number.isFinite(clientTime) &&
    Math.abs(clientTime - serverNow) <= MAX_CLIENT_CLOCK_SKEW
  ) {
    return clientTime;
  }
  return serverNow;
}

function handleBuzz(clientId, conn, data = {}) {
  const game = games.get(conn.gameCode);
  if (!game || !game.currentRound) return;

  // Prevent display clients from buzzing
  if (conn.isLeaderboardDisplay || conn.isHistoryViewer) return;

  const buzzData = game.buzz(clientId, resolveBuzzTimestamp(data));
  if (buzzData) {
    broadcastToGame(conn.gameCode, {
      type: 'buzzed',
      buzz: buzzData,
      position: game.currentRound.buzzes.length,
      currentRoundLeaderboard: game.getCurrentRoundLeaderboard(),
    });

    // Check if all players have buzzed and auto-end round
    if (game.hasAllPlayersBuzzed()) {
      scheduleAutoEnd(game);
    }
  }
}

/**
 * Auto-end fires after a delay so the final results are visible. It is bound to the
 * round it was scheduled for: previously it called endRound() on whatever round was
 * current, silently destroying a round the host had just started inside that window.
 */
function scheduleAutoEnd(game) {
  const code = game.code;
  const roundNumber = game.currentRound.roundNumber;

  setTimeout(() => {
    if (!game.currentRound || game.currentRound.roundNumber !== roundNumber) return;

    const roundResults = game.getCurrentRoundLeaderboard();
    game.endRound();

    broadcastToGame(code, {
      type: 'roundEnded',
      leaderboard: roundResults,
      autoEnded: true,
    });
  }, 1000); // 1 second delay to show final results
}

function endRound(clientId, conn) {
  if (!conn.isHost) return;
  const game = games.get(conn.gameCode);
  if (!game) return;

  // Get the current round leaderboard before ending the round
  const roundResults = game.getCurrentRoundLeaderboard();
  
  game.endRound();
  
  broadcastToGame(conn.gameCode, {
    type: 'roundEnded',
    leaderboard: roundResults,
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
      roundNumber: game.currentRound ? game.currentRound.roundNumber : 0,
      isHost: conn.isHost,
      serverTime: Date.now(),
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

/**
 * Mark a participant offline instead of deleting their seat. iOS locks/sleeps
 * close the socket, but the person is still in the room; deleting them and
 * re-adding them when the phone wakes was jarring and showed duplicate roster
 * entries.
 */
function markParticipantOffline(clientId) {
  const conn = connections.get(clientId);
  if (!conn || !conn.gameCode) return;
  if (conn.isLeaderboardDisplay || conn.isHistoryViewer) return;

  const game = games.get(conn.gameCode);
  if (!game) return;

  const participant = game.participants.get(clientId);
  if (!participant) return;

  participant.connected = false;
  broadcastToGame(conn.gameCode, {
    type: 'participantUpdated',
    participants: Array.from(game.participants.values()),
  });
}

/**
 * Remove a connection's participant seat and tell the room. Split out of
 * handleDisconnect so a reconnecting client can release its old seat cleanly
 * without relying on the old socket's close event.
 */
function detachParticipant(clientId) {
  const conn = connections.get(clientId);
  if (!conn || !conn.gameCode) return;
  if (conn.isLeaderboardDisplay || conn.isHistoryViewer) return;

  const game = games.get(conn.gameCode);
  if (!game) return;
  if (!game.participants.has(clientId)) return;

  game.removeParticipant(clientId);
  broadcastToGame(conn.gameCode, {
    type: 'participantLeft',
    participants: Array.from(game.participants.values()),
  });
}

function cleanupGameIfEmpty(gameCode) {
  const game = games.get(gameCode);
  if (!game) return;

  // Keep the game alive while any connection still references it (host reconnecting,
  // a leaderboard display still open, etc.).
  const stillReferenced = [...connections.values()].some(
    (c) => c.gameCode === gameCode
  );
  if (stillReferenced || game.participants.size > 0) return;

  games.delete(gameCode);
}

function handleDisconnect(clientId) {
  const conn = connections.get(clientId);
  if (!conn) return; // already retired by claimIdentity()

  const gameCode = conn.gameCode;
  markParticipantOffline(clientId);
  connections.delete(clientId);
  if (gameCode) cleanupGameIfEmpty(gameCode);

  console.log(`❌ Client disconnected: ${clientId}`);
}

function broadcastToGame(gameCode, message) {
  if (!gameCode) return;
  const payload = JSON.stringify(message);
  connections.forEach((conn) => {
    if (conn.gameCode === gameCode && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(payload);
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
