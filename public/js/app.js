/**
 * Buzzer Game - Client Application
 * Real-time multiplayer buzzer game with leaderboard tracking
 */

// ============================================
// Configuration
// ============================================

const CONFIG = {
  WS_RECONNECT_DELAY: 2000,      // Reconnection delay in milliseconds
  AUTO_UPDATE_INTERVAL: 5000,     // Auto-refresh interval for game state
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
  currentScreen: 'welcomeScreen', // Active UI screen
};

// ============================================
// WebSocket Management
// ============================================

/**
 * Initialize WebSocket connection with auto-reconnect
 */
function initWebSocket() {
  GameState.ws = new WebSocket(`ws://${location.host}`);

  GameState.ws.onopen = () => {
    console.log('✅ Connected to server');
  };

  GameState.ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleMessage(data);
  };

  GameState.ws.onclose = () => {
    console.log('❌ Disconnected from server');
    // Auto-reconnect if in active game
    setTimeout(() => {
      if (GameState.gameCode) {
        initWebSocket();
      }
    }, CONFIG.WS_RECONNECT_DELAY);
  };

  GameState.ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

/**
 * Send message to server
 * @param {Object} data - Message data to send
 */
function sendMessage(data) {
  if (GameState.ws && GameState.ws.readyState === WebSocket.OPEN) {
    GameState.ws.send(JSON.stringify(data));
  }
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
  
  document.getElementById('codeDisplay').textContent = GameState.gameCode;
  showScreen('hostScreen');
}

function handleJoinedGame(data) {
  GameState.clientId = data.clientId;
  GameState.gameCode = data.code;
  GameState.isHost = false;
  
  document.getElementById('gameCodeDisplay').textContent = GameState.gameCode;
  document.getElementById('playerNameDisplay').textContent = 
    document.getElementById('playerName').value;
  
  showScreen('playerScreen');
  sendMessage({ type: 'requestUpdate' });
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
}

function handleRoundEnded(data) {
  if (GameState.isHost) {
    document.getElementById('startRoundBtn').disabled = false;
    document.getElementById('endRoundBtn').disabled = true;
    document.getElementById('hostRoundInfo').innerHTML = 
      `<div class="bg-green-600/10 border-l-4 border-green-600 p-3 text-sm">
        ✅ ROUND COMPLETE
      </div>`;
  } else {
    document.getElementById('buzzBtn').disabled = true;
    document.getElementById('playerRoundInfo').innerHTML = 
      `<div class="bg-green-600 text-white p-6 text-center animate-slideDown">
        <p class="font-bebas text-3xl">ROUND ENDED</p>
      </div>`;
  }
  
  updateLeaderboard(data.leaderboard);
}

function handleGameUpdate(data) {
  updateParticipants(data.participants);
  updateLeaderboard(data.leaderboard);
  GameState.isHost = data.isHost;
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
              Avg Speed: <span class="font-bold">${entry.avgTime}ms</span> • 
              Total Buzzes: <span class="font-bold">${entry.totalBuzzes}</span> • 
              Wins: <span class="font-bold">${entry.firstPlaces}</span>
            </div>
          </div>
          <div class="font-headline text-3xl md:text-5xl text-right">${entry.avgTime}<span class="text-lg">ms</span></div>
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
  if (GameState.ws) GameState.ws.close();
  GameState.gameCode = null;
  GameState.isHost = false;
}

function showHostScreen() {
  initWebSocket();
  setTimeout(() => {
    sendMessage({ type: 'createGame' });
  }, 100);
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
    setTimeout(() => {
      sendMessage({ type: 'joinGame', name: 'Leaderboard Display', code: code.toUpperCase() });
      document.getElementById('leaderboardGameCode').textContent = code.toUpperCase();
    }, 100);
  }
}

// ============================================
// Game Actions
// ============================================

function joinGame() {
  const name = document.getElementById('playerName').value.trim();
  const code = document.getElementById('joinCode').value.trim().toUpperCase();
  
  if (!name) {
    handleError({ message: 'Please enter your name' });
    return;
  }
  
  if (!code || code.length < 4) {
    handleError({ message: 'Please enter a valid game code' });
    return;
  }

  initWebSocket();
  setTimeout(() => {
    sendMessage({ type: 'joinGame', name, code });
  }, 100);
}

function startRound() {
  sendMessage({ type: 'startRound' });
}

function endRound() {
  sendMessage({ type: 'endRound' });
}

function buzz() {
  if (!GameState.hasBuzzed) {
    GameState.hasBuzzed = true;
    sendMessage({ type: 'buzz' });
  }
}

function leaveGame() {
  if (confirm('Are you sure you want to leave this session?')) {
    showWelcomeScreen();
  }
}

// ============================================
// Initialize
// ============================================

window.onload = () => {
  showWelcomeScreen();
  console.log('🎯 Buzzer Game Event System - Ready');
};
