/**
 * Buzzer Game - Client Application
 * Real-time multiplayer buzzer game with leaderboard tracking
 */

// ============================================
// Configuration
// ============================================

const CONFIG = {
  WS_RECONNECT_DELAY: 1500,        // Initial reconnection delay in milliseconds
  WS_RECONNECT_MAX_DELAY: 15000,   // Backoff ceiling
  HEARTBEAT_INTERVAL: 20000,       // App-level ping cadence
  HEARTBEAT_TIMEOUT: 10000,        // No pong within this = socket is a zombie
};

// ============================================
// State Management
// ============================================

const GameState = {
  ws: null,          // WebSocket connection
  clientId: null,    // Unique client identifier
  gameCode: null,    // Current game code
  isHost: false,     // Is this client the host?
  hasBuzzed: false,  // Has player buzzed this round?
  roundNumber: 0,    // Round we believe is in progress (0 = none)
  name: '',          // Player name
  clockOffset: 0,    // serverTime - clientTime, kept in sync from server messages
  currentScreen: 'welcomeScreen', // Active UI screen

  // Connection health
  reconnectAttempts: 0,
  reconnectTimer: null,
  heartbeatTimer: null,
  lastPongAt: 0,
  intentionalClose: false,
  sendQueue: [],
};

// ============================================
// Session Persistence
// ============================================

// iOS Safari terminates backgrounded pages. Without this, a participant whose phone
// locked or got reclaimed mid-quiz silently lands back on the welcome screen.
const SESSION_KEY = 'buzzerSession';

function saveSession() {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      clientId: GameState.clientId,
      gameCode: GameState.gameCode,
      name: GameState.name,
      isHost: GameState.isHost,
    }));
  } catch (_) { /* private mode */ }
}

function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
  } catch (_) {
    return null;
  }
}

const RECENT_KEY = 'buzzerRecentSessions';

function getRecentSessions() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch (_) {
    return [];
  }
}

function saveRecentSessions(list) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 12)));
  } catch (_) { /* private mode */ }
}

function rememberSession(role) {
  const sessions = getRecentSessions().filter(s => s.code !== GameState.gameCode || s.role !== role);
  sessions.unshift({
    code: GameState.gameCode,
    name: GameState.name || 'Unknown',
    role,
    clientId: GameState.clientId,
    savedAt: Date.now(),
  });
  saveRecentSessions(sessions);
  renderRecentSessions();
}

function renderRecentSessions() {
  const sessions = getRecentSessions();
  const html = sessions.length
    ? sessions.map((s, i) => {
        const when = s.savedAt
          ? new Date(s.savedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })
          : '';
        return `
          <button type="button" onclick="resumeRecentSession(${i})"
                  class="w-full text-left border-2 border-ink bg-white hover:bg-blue-50 p-3 font-condensed uppercase transition-all">
            <span class="font-headline text-lg">${s.code}</span>
            <span class="mx-2 text-gray-400">·</span>
            <span>${s.name}</span>
            <span class="mx-2 text-gray-400">·</span>
            <span class="uppercase">${s.role}</span>
            ${when ? `<span class="float-right text-gray-500">${when}</span>` : ''}
          </button>`;
      }).join('')
    : '<p class="text-gray-500">No recent sessions on this device.</p>';
  const welcome = document.getElementById('recentSessionsWelcome');
  const join = document.getElementById('recentSessionsJoin');
  if (welcome) welcome.innerHTML = html;
  if (join) join.innerHTML = html;
}

function resumeRecentSession(index) {
  const session = getRecentSessions()[index];
  if (!session) return;

  if (session.role === 'host') {
    GameState.clientId = session.clientId;
    initWebSocket();
    const send = () => sendMessage({ type: 'createGame', code: session.code, clientId: session.clientId });
    if (GameState.ws && GameState.ws.readyState === WebSocket.OPEN) {
      send();
    } else {
      GameState.ws.addEventListener('open', send, { once: true });
    }
    return;
  }

  const nameInput = document.getElementById('playerName');
  const codeInput = document.getElementById('joinCode');
  if (nameInput) nameInput.value = session.name;
  if (codeInput) codeInput.value = session.code;
  joinGame(session);
}

function clearRecentSessions() {
  try { localStorage.removeItem(RECENT_KEY); } catch (_) {}
  renderRecentSessions();
}

function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch (_) { /* ignore */ }
}

// ============================================
// WebSocket Management
// ============================================

/**
 * Track the offset between this device's clock and the server's, so buzz
 * timestamps reflect the real tap instead of server arrival time.
 */
function syncClock(serverTime) {
  if (typeof serverTime !== 'number') return;
  // Ignore corrections large enough to mean the device clock was changed.
  if (Math.abs(GameState.clockOffset - (serverTime - Date.now())) > 60000) return;
  GameState.clockOffset = serverTime - Date.now();
}

/**
 * Initialize WebSocket connection with auto-reconnect
 */
function initWebSocket() {
  clearReconnectTimer();
  GameState.intentionalClose = false;
  const ws = new WebSocket(`ws://${location.host}`);
  GameState.ws = ws;

  ws.onopen = () => {
    console.log('✅ Connected to server');
    GameState.reconnectAttempts = 0;
    setConnectionStatus('online');
    startHeartbeat();
    rejoinAfterReconnect();
  };

  ws.onmessage = (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch (_) {
      return;
    }

    if (data.type === 'pong') {
      GameState.lastPongAt = Date.now();
      return;
    }

    syncClock(data.serverTime);
    handleMessage(data);
  };

  ws.onclose = () => {
    stopHeartbeat();
    if (GameState.ws === ws) GameState.ws = null;
    console.log('❌ Disconnected from server');
    setConnectionStatus(GameState.gameCode ? 'reconnecting' : 'offline');
    scheduleReconnect();
  };

  ws.onerror = () => {
    // onclose always follows; reconnection is handled there.
  };
}

/**
 * Re-announce ourselves after every (re)connect. This is the fix for the buzzer
 * going permanently dead: the server tracks each socket by the connection that
 * opened it, so a fresh socket must re-create or re-join the game or every
 * subsequent buzz is silently discarded.
 */
function rejoinAfterReconnect() {
  const session = loadSession();
  if (!session || !session.gameCode) return;

  if (session.isHost) {
    sendMessage({
      type: 'createGame',
      code: session.gameCode,
      clientId: session.clientId,
    });
    return;
  }

  if (!session.name) return;
  sendMessage({
    type: 'joinGame',
    code: session.gameCode,
    name: session.name,
    clientId: session.clientId,
  });
}

function scheduleReconnect() {
  if (GameState.intentionalClose) return;
  if (GameState.reconnectTimer) return;

  const delay = Math.min(
    CONFIG.WS_RECONNECT_DELAY * Math.pow(1.5, GameState.reconnectAttempts),
    CONFIG.WS_RECONNECT_MAX_DELAY
  );
  GameState.reconnectAttempts += 1;

  GameState.reconnectTimer = setTimeout(() => {
    GameState.reconnectTimer = null;
    initWebSocket();
  }, delay);
}

function clearReconnectTimer() {
  if (!GameState.reconnectTimer) return;
  clearTimeout(GameState.reconnectTimer);
  GameState.reconnectTimer = null;
}

/**
 * Detect sockets the network dropped without a close event (the browser still
 * reports readyState OPEN, so taps write into a void).
 */
function startHeartbeat() {
  stopHeartbeat();
  GameState.lastPongAt = Date.now();

  GameState.heartbeatTimer = setInterval(() => {
    const ws = GameState.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const silentFor = Date.now() - GameState.lastPongAt;
    if (silentFor > CONFIG.HEARTBEAT_INTERVAL + CONFIG.HEARTBEAT_TIMEOUT) {
      console.warn('⚠️ Socket unresponsive, forcing reconnect');
      try { ws.close(); } catch (_) { /* ignore */ }
      return;
    }

    try {
      ws.send(JSON.stringify({ type: 'ping' }));
    } catch (_) {
      try { ws.close(); } catch (_) { /* ignore */ }
    }
  }, CONFIG.HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  if (!GameState.heartbeatTimer) return;
  clearInterval(GameState.heartbeatTimer);
  GameState.heartbeatTimer = null;
}

/**
 * Send message to server. Anything sent while the socket is down is queued and
 * flushed on reconnect rather than silently dropped.
 * @param {Object} data - Message data to send
 */
function sendMessage(data) {
  const ws = GameState.ws;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
    return true;
  }
  // Only queue the messages that are safe to replay after a reconnect.
  if (data.type === 'buzz' || data.type === 'startRound' || data.type === 'endRound') {
    GameState.sendQueue.push(data);
  }
  return false;
}

function flushSendQueue() {
  if (!GameState.sendQueue.length) return;
  const ws = GameState.ws;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const queued = GameState.sendQueue;
  GameState.sendQueue = [];
  queued.forEach((msg) => sendMessage(msg));
}

/**
 * Surface connection state so a participant whose buzzer went quiet can SEE why,
 * instead of tapping a dead button with no feedback.
 */
function setConnectionStatus(state) {
  const banner = document.getElementById('connectionBanner');
  if (!banner) return;

  const labels = {
    online: { text: '', className: 'hidden' },
    reconnecting: {
      text: '⚠️ Reconnecting… your buzzer is temporarily offline',
      className: 'bg-yellow-500 text-ink',
    },
    offline: {
      text: '⚠️ Offline — reconnecting…',
      className: 'bg-yellow-500 text-ink',
    },
  };

  const config = labels[state] || labels.offline;
  banner.textContent = config.text;
  banner.className = `connection-banner ${config.className}`;
}

// ============================================
// Message Handlers
// ============================================

/**
 * Route incoming WebSocket messages
 * @param {Object} data - Parsed message data
 */
function handleMessage(data) {
  console.log('Received:', data);

  const handlers = {
    gameCreated: handleGameCreated,
    joinedGame: handleJoinedGame,
    error: handleError,
    participantJoined: handleParticipantUpdate,
    participantLeft: handleParticipantUpdate,
    roundStarted: handleRoundStarted,
    buzzed: handleBuzzed,
    roundEnded: handleRoundEnded,
    gameUpdate: handleGameUpdate,
  };

  const handler = handlers[data.type];
  if (handler) {
    handler(data);
  }
}

function handleGameCreated(data) {
  GameState.clientId = data.clientId;
  GameState.gameCode = data.code;
  GameState.isHost = true;
  GameState.name = 'Host';
  saveSession();
  rememberSession('host');
  
  document.getElementById('codeDisplay').textContent = GameState.gameCode;
  showScreen('hostScreen');
}

function handleJoinedGame(data) {
  GameState.clientId = data.clientId;
  GameState.gameCode = data.code;
  GameState.isHost = false;

  const nameInput = document.getElementById('playerName');
  if (nameInput && nameInput.value.trim()) {
    GameState.name = nameInput.value.trim();
  }
  saveSession();
  rememberSession('player');

  document.getElementById('gameCodeDisplay').textContent = GameState.gameCode;
  document.getElementById('playerNameDisplay').textContent = GameState.name;
  
  showScreen('playerScreen');
  setConnectionStatus('online');
  resyncRoundState();
  flushSendQueue();
}

function handleError(data) {
  const errorHtml = `
    <div class="border-4 border-red-stamp bg-red-stamp/10 p-4 animate-slideDown">
      <p class="font-bold text-red-stamp">${data.message}</p>
    </div>
  `;
  document.getElementById('joinError').innerHTML = errorHtml;
}

function handleParticipantUpdate(data) {
  updateParticipants(data.participants);
}

function handleRoundStarted(data) {
  GameState.hasBuzzed = false;
  GameState.roundNumber = data.roundNumber;
  
  if (GameState.isHost) {
    document.getElementById('startRoundBtn').disabled = true;
    document.getElementById('endRoundBtn').disabled = false;
    document.getElementById('hostRoundInfo').innerHTML = 
      `<div class="bg-blue-ink/10 border-l-4 border-blue-ink p-3 text-sm">
        ⚡ ROUND ${data.roundNumber} IN PROGRESS
      </div>`;
    document.getElementById('hostBuzzResults').innerHTML = '';
  } else {
    document.getElementById('buzzBtn').disabled = false;
    document.getElementById('playerRoundInfo').innerHTML = 
      `<div class="bg-blue-ink text-white p-6 text-center animate-slideDown">
        <p class="font-bebas text-3xl md:text-4xl">ROUND ${data.roundNumber}</p>
        <p class="text-sm md:text-base mt-2">GET READY TO BUZZ!</p>
      </div>`;
    document.getElementById('playerBuzzResult').innerHTML = '';
  }
  
  // Clear leaderboards for new round - this happens for all clients
  updateCurrentRoundLeaderboard([]);
}

function handleBuzzed(data) {
  if (GameState.isHost) {
    const buzzHtml = `
      <div class="border-l-4 ${data.position === 1 ? 'border-red-stamp bg-red-stamp/10' : 'border-ink bg-ink/5'} p-4 animate-slideDown">
        <div class="flex items-center justify-between">
          <div>
            <span class="font-bold text-lg">${data.position === 1 ? '🏆' : '#' + data.position}</span>
            <span class="font-bebas text-xl ml-3">${data.buzz.name}</span>
          </div>
          <div class="font-headline text-2xl">${data.buzz.time}ms</div>
        </div>
      </div>
    `;
    document.getElementById('hostBuzzResults').innerHTML += buzzHtml;
  } else {
    if (data.buzz.name === document.getElementById('playerNameDisplay').textContent) {
      document.getElementById('buzzBtn').disabled = true;
      
      const resultHtml = `
        <div class="border-4 ${data.position === 1 ? 'border-red-stamp bg-red-stamp' : 'border-ink bg-ink'} text-white p-8 text-center animate-slideDown">
          ${data.position === 1 
            ? '<p class="font-headline text-5xl mb-4">🏆 FIRST PLACE!</p>' 
            : `<p class="font-bebas text-4xl mb-4">POSITION #${data.position}</p>`
          }
          <p class="font-bebas text-3xl">Your Time: ${data.buzz.time}ms</p>
        </div>
      `;
      document.getElementById('playerBuzzResult').innerHTML = resultHtml;
    }
  }
  
  // Update current round leaderboard if available
  if (data.currentRoundLeaderboard) {
    updateCurrentRoundLeaderboard(data.currentRoundLeaderboard);
  }
}

function handleRoundEnded(data) {
  GameState.roundNumber = 0;
  GameState.hasBuzzed = false;

  if (GameState.isHost) {
    document.getElementById('startRoundBtn').disabled = false;
    document.getElementById('endRoundBtn').disabled = true;
    const endMessage = data.autoEnded ? 'ALL PLAYERS BUZZED - ROUND AUTO-ENDED' : 'ROUND COMPLETE';
    document.getElementById('hostRoundInfo').innerHTML = 
      `<div class="bg-green-600/10 border-l-4 border-green-600 p-3 text-sm">
        ✅ ${endMessage}
      </div>`;
  } else {
    document.getElementById('buzzBtn').disabled = true;
    const endMessage = data.autoEnded ? 'ALL PLAYERS BUZZED!' : 'ROUND ENDED';
    document.getElementById('playerRoundInfo').innerHTML = 
      `<div class="bg-green-600 text-white p-6 text-center animate-slideDown">
        <p class="font-bebas text-3xl">${endMessage}</p>
      </div>`;
  }
  
  updateLeaderboard(data.leaderboard);
}

function handleGameUpdate(data) {
  updateParticipants(data.participants);
  updateLeaderboard(data.leaderboard);
  GameState.isHost = data.isHost;

  // Reconcile round state. A client that missed a broadcast (disconnect, screen
  // lock, backgrounded tab) would otherwise keep a stale hasBuzzed=true and a
  // disabled button, which is exactly the dead-buzzer symptom.
  const roundNumber = typeof data.roundNumber === 'number'
    ? data.roundNumber
    : (data.currentRound ? data.currentRound.roundNumber : 0);

  if (roundNumber !== GameState.roundNumber) {
    GameState.roundNumber = roundNumber;
    GameState.hasBuzzed = false;

    const btn = document.getElementById('buzzBtn');
    if (btn) btn.disabled = roundNumber === 0;
  }

  // The round is still open and this player is already on the board: they buzzed
  // before the disconnect. The server rejects a second buzz, so lock the button
  // rather than letting them tap into silence.
  const btn = document.getElementById('buzzBtn');
  if (!GameState.isHost && roundNumber > 0 && btn) {
    const alreadyBuzzed = (data.leaderboard || []).some(
      (entry) => entry.name === GameState.name
    );
    if (alreadyBuzzed) {
      GameState.hasBuzzed = true;
      btn.disabled = true;
    }
  }
}

/**
 * Ask the server for authoritative state after a reconnect or a resume, then
 * re-check the player list.
 */
function resyncRoundState() {
  GameState.hasBuzzed = false;
  sendMessage({ type: 'requestUpdate' });
}

// ============================================
// UI Updates
// ============================================

function updateParticipants(participants) {
  if (!GameState.isHost) return;
  
  const list = document.getElementById('participantsList');
  document.getElementById('participantCount').textContent = participants.length;
  
  if (participants.length === 0) {
    list.innerHTML = '<div class="text-gray-500 text-center text-sm">Waiting for players to join...</div>';
  } else {
    list.innerHTML = participants.map((p, index) => 
      `<div class="border-l-4 border-blue-ink bg-blue-ink/5 p-3 animate-slideDown" style="animation-delay: ${index * 0.05}s">
        <span class="font-condensed text-base">👤 ${p.name}</span>
      </div>`
    ).join('');
  }
}

function updateLeaderboard(leaderboard) {
  const hostBoard = document.getElementById('hostLeaderboard');
  const playerBoard = document.getElementById('playerLeaderboard');
  const displayBoard = document.getElementById('leaderboardDisplay');
  
  if (!leaderboard || leaderboard.length === 0) {
    const emptyMsg = '<div class="text-center text-gray-500 text-sm py-8">No rankings yet. Complete a round to see results!</div>';
    if (hostBoard) hostBoard.innerHTML = emptyMsg;
    if (playerBoard) playerBoard.innerHTML = emptyMsg;
    return;
  }

  const rankings = [
    { border: 'border-yellow-500', bg: 'bg-yellow-500/20', medal: '🥇' },
    { border: 'border-gray-400', bg: 'bg-gray-400/20', medal: '🥈' },
    { border: 'border-orange-600', bg: 'bg-orange-600/20', medal: '🥉' }
  ];
  
  const html = leaderboard.map((entry, index) => {
    const rank = rankings[index] || { border: 'border-blue-ink', bg: 'bg-blue-ink/10', medal: '🏅' };
    return `
      <div class="border-4 ${rank.border} ${rank.bg} p-4 md:p-6 animate-slideDown" style="animation-delay: ${index * 0.1}s">
        <div class="flex items-center gap-4">
          <div class="text-4xl md:text-5xl min-w-[60px] text-center">${rank.medal}</div>
          <div class="flex-1">
            <div class="font-bebas text-2xl md:text-3xl mb-1">${entry.name}</div>
            <div class="font-condensed text-xs md:text-sm text-gray-700">
              Current Round • Position: <span class="font-bold">#${entry.position}</span>
            </div>
          </div>
          <div class="font-headline text-3xl md:text-5xl text-right">${entry.time}<span class="text-lg">ms</span></div>
        </div>
      </div>
    `;
  }).join('');

  if (hostBoard) hostBoard.innerHTML = html;
  if (playerBoard) playerBoard.innerHTML = html;
  if (displayBoard) displayBoard.innerHTML = html;
}

function updateCurrentRoundLeaderboard(leaderboard) {
  const hostBoard = document.getElementById('hostLeaderboard');
  const playerBoard = document.getElementById('playerLeaderboard');
  const displayBoard = document.getElementById('leaderboardDisplay');
  
  if (!leaderboard || leaderboard.length === 0) {
    const emptyMsg = '<div class="text-center text-gray-500 text-sm py-8">Waiting for players to buzz...</div>';
    if (hostBoard) hostBoard.innerHTML = emptyMsg;
    if (playerBoard) playerBoard.innerHTML = emptyMsg;
    if (displayBoard) displayBoard.innerHTML = emptyMsg;
    return;
  }

  const rankings = [
    { border: 'border-yellow-500', bg: 'bg-yellow-500/20', medal: '🥇' },
    { border: 'border-gray-400', bg: 'bg-gray-400/20', medal: '🥈' },
    { border: 'border-orange-600', bg: 'bg-orange-600/20', medal: '🥉' }
  ];
  
  const html = leaderboard.map((entry, index) => {
    const rank = rankings[index] || { border: 'border-blue-ink', bg: 'bg-blue-ink/10', medal: '🏅' };
    return `
      <div class="border-4 ${rank.border} ${rank.bg} p-4 md:p-6 animate-slideDown" style="animation-delay: ${index * 0.1}s">
        <div class="flex items-center gap-4">
          <div class="text-4xl md:text-5xl min-w-[60px] text-center">${rank.medal}</div>
          <div class="flex-1">
            <div class="font-bebas text-2xl md:text-3xl mb-1">${entry.name}</div>
            <div class="font-condensed text-sm text-gray-700">
              Current Round Position: <span class="font-bold">#${entry.position}</span>
            </div>
          </div>
          <div class="font-headline text-3xl md:text-5xl text-right">${entry.time}<span class="text-lg">ms</span></div>
        </div>
      </div>
    `;
  }).join('');

  if (hostBoard) hostBoard.innerHTML = html;
  if (playerBoard) playerBoard.innerHTML = html;
  if (displayBoard) displayBoard.innerHTML = html;
}

// ============================================
// Screen Navigation
// ============================================

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
  GameState.currentScreen = screenId;
}

function showWelcomeScreen() {
  showScreen('welcomeScreen');
  GameState.intentionalClose = true;
  clearReconnectTimer();
  stopHeartbeat();
  if (GameState.ws) {
    try { GameState.ws.close(); } catch (_) { /* ignore */ }
  }
  GameState.ws = null;
  GameState.gameCode = null;
  GameState.clientId = null;
  GameState.isHost = false;
  GameState.hasBuzzed = false;
  GameState.roundNumber = 0;
  GameState.name = '';
  GameState.sendQueue = [];
  clearSession();
  setConnectionStatus('offline');
}

function showHostScreen() {
  initWebSocket();
  const send = () => sendMessage({ type: 'createGame' });
  if (GameState.ws && GameState.ws.readyState === WebSocket.OPEN) {
    send();
  } else {
    GameState.ws.addEventListener('open', send, { once: true });
  }
}

function showJoinScreen() {
  showScreen('joinScreen');
  document.getElementById('joinError').innerHTML = '';
}

function showLeaderboardOnly() {
  showScreen('leaderboardScreen');
  
  // Prompt for game code to connect to
  const code = prompt('Enter game code to display leaderboard (or leave blank for standalone):');
  if (code && code.trim()) {
    initWebSocket();
    const send = () => {
      sendMessage({ type: 'joinGame', name: 'Leaderboard Display', code: code.toUpperCase() });
      document.getElementById('leaderboardGameCode').textContent = code.toUpperCase();
    };
    if (GameState.ws && GameState.ws.readyState === WebSocket.OPEN) {
      send();
    } else {
      GameState.ws.addEventListener('open', send, { once: true });
    }
  }
}

// ============================================
// Game Actions
// ============================================

function joinGame(storedSession = null) {
  const name = (storedSession && storedSession.name) || document.getElementById('playerName').value.trim();
  const code = (storedSession && storedSession.code) || document.getElementById('joinCode').value.trim().toUpperCase();
  
  if (!name) {
    handleError({ message: 'Please enter your name' });
    return;
  }
  
  if (!code || code.length < 4) {
    handleError({ message: 'Please enter a valid game code' });
    return;
  }

  GameState.name = name;
  if (storedSession && storedSession.clientId) GameState.clientId = storedSession.clientId;
  initWebSocket();
  const send = () => sendMessage({ type: 'joinGame', name, code, clientId: storedSession ? storedSession.clientId : GameState.clientId });
  if (GameState.ws && GameState.ws.readyState === WebSocket.OPEN) {
    send();
  } else {
    GameState.ws.addEventListener('open', send, { once: true });
  }
}

function startRound() {
  sendMessage({ type: 'startRound' });
}

function endRound() {
  sendMessage({ type: 'endRound' });
}

function buzz() {
  // Surface a dropped connection instead of pretending the tap registered.
  if (!GameState.ws || GameState.ws.readyState !== WebSocket.OPEN) {
    setConnectionStatus('reconnecting');
    scheduleReconnect();
    return;
  }

  if (!GameState.hasBuzzed) {
    GameState.hasBuzzed = true;
    // Timestamp is corrected to server time so rankings reflect the real tap
    // rather than this phone's share of the WiFi round-trip.
    sendMessage({ type: 'buzz', timestamp: Date.now() + GameState.clockOffset });
  }
}

function leaveGame() {
  if (confirm('Are you sure you want to leave this session?')) {
    showWelcomeScreen();
  }
}

// ============================================
// Lifecycle / Visibility
// ============================================

/**
 * Phones sitting on a table lock their screen mid-quiz. The OS suspends JS and
 * reaps idle sockets, so coming back needs an explicit resync — otherwise the
 * player is left holding a dead buzzer with a stale leaderboard on screen.
 */
function handleResume() {
  if (!GameState.gameCode) return;

  const ws = GameState.ws;
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    initWebSocket();
    return;
  }

  resyncRoundState();
}

// ============================================
// Initialize
// ============================================

// Runs at script execution (end of <body>), NOT on window.onload. Waiting for
// `load` blocks on the Tailwind CDN and Google Fonts, and on slow venue WiFi that
// is seconds during which someone can already join — after which a late onload
// handler would tear down their live socket and bounce them to the welcome screen.
(function init() {
  if (window.__buzzerInitialized) return;
  window.__buzzerInitialized = true;

  // Read the stored session before any user interaction can overwrite it.
  const session = loadSession();

  showScreen('welcomeScreen');
  renderRecentSessions();
  setConnectionStatus('offline');

  // Restore a session interrupted by an iOS page reload or process termination.
  if (session && session.gameCode) {
    GameState.gameCode = session.gameCode;
    GameState.clientId = session.clientId;
    GameState.name = session.name || '';
    GameState.isHost = !!session.isHost;
    saveSession(); // re-persist: showScreen() path above cleared it
    initWebSocket();
    console.log(`♻️ Restored session for ${session.isHost ? 'host' : session.name}`);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') handleResume();
  });
  window.addEventListener('focus', handleResume);
  window.addEventListener('online', handleResume);
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) handleResume();
  });

  console.log('🎯 Buzzer Game Event System - Ready');
})();
