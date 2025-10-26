/**// ============================================

 * Buzzer Game - Client Application// BUZZER GAME - Modular Event System

 * Real-time multiplayer buzzer game with leaderboard tracking// ============================================

 */

// Configuration

// ============================================const CONFIG = {

// Configuration  WS_RECONNECT_DELAY: 2000,

// ============================================  AUTO_UPDATE_INTERVAL: 5000,

};

const CONFIG = {

  WS_RECONNECT_DELAY: 2000,      // Reconnection delay in milliseconds// State Management

  AUTO_UPDATE_INTERVAL: 5000,     // Auto-refresh interval for game stateconst GameState = {

};  ws: null,

  clientId: null,

// ============================================  gameCode: null,

// State Management  isHost: false,

// ============================================  hasBuzzed: false,

  currentScreen: 'welcomeScreen',

const GameState = {};

  ws: null,          // WebSocket connection

  clientId: null,    // Unique client identifier// ============================================

  gameCode: null,    // Current game code// WebSocket Management

  isHost: false,     // Is this client the host?// ============================================

  hasBuzzed: false,  // Has player buzzed this round?

  currentScreen: 'welcomeScreen', // Active UI screenfunction initWebSocket() {

};  GameState.ws = new WebSocket(`ws://${location.host}`);



// ============================================  GameState.ws.onopen = () => {

// WebSocket Management    console.log('✅ Connected to server');

// ============================================  };



/**  GameState.ws.onmessage = (event) => {

 * Initialize WebSocket connection with auto-reconnect    const data = JSON.parse(event.data);

 */    handleMessage(data);

function initWebSocket() {  };

  GameState.ws = new WebSocket(`ws://${location.host}`);

  GameState.ws.onclose = () => {

  GameState.ws.onopen = () => {    console.log('❌ Disconnected from server');

    console.log('✅ Connected to server');    setTimeout(() => {

  };      if (GameState.gameCode) {

        initWebSocket();

  GameState.ws.onmessage = (event) => {      }

    const data = JSON.parse(event.data);    }, CONFIG.WS_RECONNECT_DELAY);

    handleMessage(data);  };

  };

  GameState.ws.onerror = (error) => {

  GameState.ws.onclose = () => {    console.error('WebSocket error:', error);

    console.log('❌ Disconnected from server');  };

    // Auto-reconnect if in active game}

    setTimeout(() => {

      if (GameState.gameCode) {function sendMessage(data) {

        initWebSocket();  if (GameState.ws && GameState.ws.readyState === WebSocket.OPEN) {

      }    GameState.ws.send(JSON.stringify(data));

    }, CONFIG.WS_RECONNECT_DELAY);  }

  };}



  GameState.ws.onerror = (error) => {// ============================================

    console.error('WebSocket error:', error);// Message Handlers

  };// ============================================

}

function handleMessage(data) {

/**  console.log('Received:', data);

 * Send message to server

 * @param {Object} data - Message data to send  const handlers = {

 */    gameCreated: handleGameCreated,

function sendMessage(data) {    joinedGame: handleJoinedGame,

  if (GameState.ws && GameState.ws.readyState === WebSocket.OPEN) {    error: handleError,

    GameState.ws.send(JSON.stringify(data));    participantJoined: handleParticipantUpdate,

  }    participantLeft: handleParticipantUpdate,

}    roundStarted: handleRoundStarted,

    buzzed: handleBuzzed,

// ============================================    roundEnded: handleRoundEnded,

// Message Handler    gameUpdate: handleGameUpdate,

// ============================================  };



/**  const handler = handlers[data.type];

 * Route incoming WebSocket messages  if (handler) {

 * @param {Object} data - Parsed message data    handler(data);

 */  }

function handleMessage(data) {}

  switch (data.type) {

    case 'gameCreated':function handleGameCreated(data) {

      handleGameCreated(data);  GameState.clientId = data.clientId;

      break;  GameState.gameCode = data.code;

    case 'joinedGame':  GameState.isHost = true;

      handleJoinedGame(data);  

      break;  document.getElementById('codeDisplay').textContent = GameState.gameCode;

    case 'participantJoined':  showScreen('hostScreen');

      updateParticipants(data.participants);}

      break;

    case 'participantLeft':function handleJoinedGame(data) {

      updateParticipants(data.participants);  GameState.clientId = data.clientId;

      break;  GameState.gameCode = data.code;

    case 'roundStarted':  GameState.isHost = false;

      handleRoundStarted(data);  

      break;  document.getElementById('gameCodeDisplay').textContent = GameState.gameCode;

    case 'buzzed':  document.getElementById('playerNameDisplay').textContent = 

      handleBuzzed(data);    document.getElementById('playerName').value;

      break;  

    case 'roundEnded':  showScreen('playerScreen');

      handleRoundEnded(data);  sendMessage({ type: 'requestUpdate' });

      break;}

    case 'gameUpdate':

      handleGameUpdate(data);function handleError(data) {

      break;  const errorHtml = `

    case 'error':    <div class="border-4 border-red-stamp bg-red-stamp/10 p-4 animate-slideDown">

      alert(data.message);      <p class="font-bold text-red-stamp">${data.message}</p>

      break;    </div>

  }  `;

}  document.getElementById('joinError').innerHTML = errorHtml;

}

// ============================================

// Game Event Handlersfunction handleParticipantUpdate(data) {

// ============================================  updateParticipants(data.participants);

}

/**

 * Handle game creation confirmationfunction handleRoundStarted(data) {

 */  GameState.hasBuzzed = false;

function handleGameCreated(data) {  

  GameState.gameCode = data.code;  if (GameState.isHost) {

  GameState.clientId = data.clientId;    document.getElementById('startRoundBtn').disabled = true;

  GameState.isHost = true;    document.getElementById('endRoundBtn').disabled = false;

    document.getElementById('hostRoundInfo').innerHTML = 

  document.getElementById('hostGameCode').textContent = data.code;      `<div class="bg-blue-ink/10 border-l-4 border-blue-ink p-3 text-sm">

  showScreen('hostScreen');        ⚡ ROUND ${data.roundNumber} IN PROGRESS

}      </div>`;

    document.getElementById('hostBuzzResults').innerHTML = '';

/**  } else {

 * Handle successful game join    document.getElementById('buzzBtn').disabled = false;

 */    document.getElementById('playerRoundInfo').innerHTML = 

function handleJoinedGame(data) {      `<div class="bg-blue-ink text-white p-6 text-center animate-slideDown">

  GameState.gameCode = data.code;        <p class="font-bebas text-3xl md:text-4xl">ROUND ${data.roundNumber}</p>

  GameState.clientId = data.clientId;        <p class="text-sm md:text-base mt-2">GET READY TO BUZZ!</p>

  GameState.isHost = false;      </div>`;

    document.getElementById('playerBuzzResult').innerHTML = '';

  document.getElementById('playerGameCode').textContent = data.code;  }

  showScreen('playerScreen');}



  // Start polling for updatesfunction handleBuzzed(data) {

  setInterval(() => {  if (GameState.isHost) {

    sendMessage({ type: 'requestUpdate' });    const buzzHtml = `

  }, CONFIG.AUTO_UPDATE_INTERVAL);      <div class="border-l-4 ${data.position === 1 ? 'border-red-stamp bg-red-stamp/10' : 'border-ink bg-ink/5'} p-4 animate-slideDown">

}        <div class="flex items-center justify-between">

          <div>

/**            <span class="font-bold text-lg">${data.position === 1 ? '🏆' : '#' + data.position}</span>

 * Handle round start notification            <span class="font-bebas text-xl ml-3">${data.buzz.name}</span>

 */          </div>

function handleRoundStarted(data) {          <div class="font-headline text-2xl">${data.buzz.time}ms</div>

  GameState.hasBuzzed = false;        </div>

      </div>

  if (!GameState.isHost) {    `;

    document.getElementById('buzzButton').disabled = false;    document.getElementById('hostBuzzResults').innerHTML += buzzHtml;

    document.getElementById('buzzButton').classList.remove('opacity-50', 'cursor-not-allowed');  } else {

  }    if (data.buzz.name === document.getElementById('playerNameDisplay').textContent) {

      document.getElementById('buzzBtn').disabled = true;

  document.getElementById('roundNumber').textContent = data.roundNumber;      

  document.getElementById('buzzFeedback').textContent = '';      const resultHtml = `

        <div class="border-4 ${data.position === 1 ? 'border-red-stamp bg-red-stamp' : 'border-ink bg-ink'} text-white p-8 text-center animate-slideDown">

  // Clear previous round buzzes          ${data.position === 1 

  document.getElementById('buzzList').innerHTML = '';            ? '<p class="font-headline text-5xl mb-4">🏆 FIRST PLACE!</p>' 

            : `<p class="font-bebas text-4xl mb-4">POSITION #${data.position}</p>`

  if (GameState.isHost) {          }

    document.getElementById('startRoundButton').disabled = true;          <p class="font-bebas text-3xl">Your Time: ${data.buzz.time}ms</p>

    document.getElementById('endRoundButton').disabled = false;        </div>

  }      `;

}      document.getElementById('playerBuzzResult').innerHTML = resultHtml;

    }

/**  }

 * Handle buzz notification}

 */

function handleBuzzed(data) {function handleRoundEnded(data) {

  const buzzList = document.getElementById('buzzList');  if (GameState.isHost) {

  const buzzItem = document.createElement('div');    document.getElementById('startRoundBtn').disabled = false;

  buzzItem.className = 'border-b border-gray-300 pb-2';    document.getElementById('endRoundBtn').disabled = true;

  buzzItem.innerHTML = `    document.getElementById('hostRoundInfo').innerHTML = 

    <div class="flex justify-between items-center">      `<div class="bg-green-600/10 border-l-4 border-green-600 p-3 text-sm">

      <span class="font-bebas text-lg">        ✅ ROUND COMPLETE

        ${data.position === 1 ? '🥇' : data.position === 2 ? '🥈' : data.position === 3 ? '🥉' : ''}      </div>`;

        ${data.buzz.name}  } else {

      </span>    document.getElementById('buzzBtn').disabled = true;

      <span class="font-roboto font-bold text-red-600">${data.buzz.time}ms</span>    document.getElementById('playerRoundInfo').innerHTML = 

    </div>      `<div class="bg-green-600 text-white p-6 text-center animate-slideDown">

  `;        <p class="font-bebas text-3xl">ROUND ENDED</p>

  buzzList.appendChild(buzzItem);      </div>`;

  }

  // Show feedback to buzzer  

  if (data.buzz.participantId === GameState.clientId) {  updateLeaderboard(data.leaderboard);

    GameState.hasBuzzed = true;}

    document.getElementById('buzzButton').disabled = true;

    document.getElementById('buzzButton').classList.add('opacity-50', 'cursor-not-allowed');function handleGameUpdate(data) {

    document.getElementById('buzzFeedback').textContent =   updateParticipants(data.participants);

      `Position #${data.position} - ${data.buzz.time}ms`;  updateLeaderboard(data.leaderboard);

  }  GameState.isHost = data.isHost;

}}



/**// ============================================

 * Handle round end and leaderboard update// UI Updates

 */// ============================================

function handleRoundEnded(data) {

  updateLeaderboard(data.leaderboard);function updateParticipants(participants) {

  if (!GameState.isHost) return;

  if (GameState.isHost) {  

    document.getElementById('startRoundButton').disabled = false;  const list = document.getElementById('participantsList');

    document.getElementById('endRoundButton').disabled = true;  document.getElementById('participantCount').textContent = participants.length;

  }  

  if (participants.length === 0) {

  // Reset buzz button for players    list.innerHTML = '<div class="text-gray-500 text-center text-sm">Waiting for players to join...</div>';

  if (!GameState.isHost) {  } else {

    document.getElementById('buzzButton').disabled = true;    list.innerHTML = participants.map((p, index) => 

    document.getElementById('buzzButton').classList.add('opacity-50', 'cursor-not-allowed');      `<div class="border-l-4 border-blue-ink bg-blue-ink/5 p-3 animate-slideDown" style="animation-delay: ${index * 0.05}s">

  }        <span class="font-condensed text-base">👤 ${p.name}</span>

}      </div>`

    ).join('');

/**  }

 * Handle full game state update}

 */

function handleGameUpdate(data) {function updateLeaderboard(leaderboard) {

  if (data.participants) {  const hostBoard = document.getElementById('hostLeaderboard');

    updateParticipants(data.participants);  const playerBoard = document.getElementById('playerLeaderboard');

  }  const displayBoard = document.getElementById('leaderboardDisplay');

  if (data.leaderboard) {  

    updateLeaderboard(data.leaderboard);  if (!leaderboard || leaderboard.length === 0) {

  }    const emptyMsg = '<div class="text-center text-gray-500 text-sm py-8">No rankings yet. Complete a round to see results!</div>';

}    if (hostBoard) hostBoard.innerHTML = emptyMsg;

    if (playerBoard) playerBoard.innerHTML = emptyMsg;

// ============================================    return;

// UI Updates  }

// ============================================

  const rankings = [

/**    { border: 'border-yellow-500', bg: 'bg-yellow-500/20', medal: '🥇' },

 * Update participants list    { border: 'border-gray-400', bg: 'bg-gray-400/20', medal: '🥈' },

 * @param {Array} participants - Array of participant objects    { border: 'border-orange-600', bg: 'bg-orange-600/20', medal: '🥉' }

 */  ];

function updateParticipants(participants) {  

  const list = document.getElementById('participantsList');  const html = leaderboard.map((entry, index) => {

  if (!list) return;    const rank = rankings[index] || { border: 'border-blue-ink', bg: 'bg-blue-ink/10', medal: '🏅' };

    return `

  list.innerHTML = participants      <div class="border-4 ${rank.border} ${rank.bg} p-4 md:p-6 animate-slideDown" style="animation-delay: ${index * 0.1}s">

    .map(        <div class="flex items-center gap-4">

      (p) => `          <div class="text-4xl md:text-5xl min-w-[60px] text-center">${rank.medal}</div>

    <div class="border-b border-gray-300 py-2">          <div class="flex-1">

      <span class="font-bebas text-xl">${p.name}</span>            <div class="font-bebas text-2xl md:text-3xl mb-1">${entry.name}</div>

      <span class="text-sm text-gray-600 ml-2">(${p.buzzHistory.length} buzzes)</span>            <div class="font-condensed text-xs md:text-sm text-gray-700">

    </div>              Avg Speed: <span class="font-bold">${entry.avgTime}ms</span> • 

  `              Total Buzzes: <span class="font-bold">${entry.totalBuzzes}</span> • 

    )              Wins: <span class="font-bold">${entry.firstPlaces}</span>

    .join('');            </div>

}          </div>

          <div class="font-headline text-3xl md:text-5xl text-right">${entry.avgTime}<span class="text-lg">ms</span></div>

/**        </div>

 * Update leaderboard display      </div>

 * @param {Array} leaderboard - Sorted array of player stats    `;

 */  }).join('');

function updateLeaderboard(leaderboard) {

  const lists = [  if (hostBoard) hostBoard.innerHTML = html;

    document.getElementById('hostLeaderboard'),  if (playerBoard) playerBoard.innerHTML = html;

    document.getElementById('playerLeaderboard'),  if (displayBoard) displayBoard.innerHTML = html;

  ];}



  lists.forEach((list) => {// ============================================

    if (!list) return;// Screen Navigation

// ============================================

    if (leaderboard.length === 0) {

      list.innerHTML = '<p class="text-gray-500 italic text-center py-4">No data yet</p>';function showScreen(screenId) {

      return;  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

    }  document.getElementById(screenId).classList.add('active');

  GameState.currentScreen = screenId;

    list.innerHTML = leaderboard}

      .map(

        (p, i) => `function showWelcomeScreen() {

      <div class="border-b border-gray-300 pb-3 mb-3">  showScreen('welcomeScreen');

        <div class="flex justify-between items-center">  if (GameState.ws) GameState.ws.close();

          <span class="font-bebas text-2xl">  GameState.gameCode = null;

            ${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}  GameState.isHost = false;

            ${p.name}}

          </span>

          <span class="font-roboto font-bold text-red-600 text-xl">${p.avgTime}ms</span>function showHostScreen() {

        </div>  initWebSocket();

        <div class="flex gap-4 text-sm text-gray-600 mt-1">  setTimeout(() => {

          <span>Buzzes: ${p.totalBuzzes}</span>    sendMessage({ type: 'createGame' });

          <span>Wins: ${p.firstPlaces}</span>  }, 100);

        </div>}

      </div>

    `function showJoinScreen() {

      )  showScreen('joinScreen');

      .join('');  document.getElementById('joinError').innerHTML = '';

  });}

}

function showLeaderboardOnly() {

/**  showScreen('leaderboardScreen');

 * Show specific screen and hide others  

 * @param {string} screenId - ID of screen to show  // Prompt for game code to connect to

 */  const code = prompt('Enter game code to display leaderboard (or leave blank for standalone):');

function showScreen(screenId) {  if (code && code.trim()) {

  GameState.currentScreen = screenId;    initWebSocket();

  document.querySelectorAll('.screen').forEach((screen) => {    setTimeout(() => {

    screen.classList.add('hidden');      sendMessage({ type: 'joinGame', name: 'Leaderboard Display', code: code.toUpperCase() });

  });      document.getElementById('leaderboardGameCode').textContent = code.toUpperCase();

  document.getElementById(screenId).classList.remove('hidden');    }, 100);

}  }

}

// ============================================

// Game Actions// ============================================

// ============================================// Game Actions

// ============================================

/**

 * Create a new game as hostfunction joinGame() {

 */  const name = document.getElementById('playerName').value.trim();

function createGame() {  const code = document.getElementById('joinCode').value.trim().toUpperCase();

  sendMessage({ type: 'createGame' });  

}  if (!name) {

    handleError({ message: 'Please enter your name' });

/**    return;

 * Join existing game as player  }

 */  

function joinGame() {  if (!code || code.length < 4) {

  const code = document.getElementById('joinCodeInput').value.trim().toUpperCase();    handleError({ message: 'Please enter a valid game code' });

  const name = document.getElementById('playerNameInput').value.trim();    return;

  }

  if (!code || !name) {

    alert('Please enter both game code and your name');  initWebSocket();

    return;  setTimeout(() => {

  }    sendMessage({ type: 'joinGame', name, code });

  }, 100);

  sendMessage({}

    type: 'joinGame',

    code,function startRound() {

    name,  sendMessage({ type: 'startRound' });

  });}

}

function endRound() {

/**  sendMessage({ type: 'endRound' });

 * Start a new round (host only)}

 */

function startRound() {function buzz() {

  if (!GameState.isHost) return;  if (!GameState.hasBuzzed) {

  sendMessage({ type: 'startRound' });    GameState.hasBuzzed = true;

}    sendMessage({ type: 'buzz' });

  }

/**}

 * Submit buzz (player only)

 */function leaveGame() {

function buzz() {  if (confirm('Are you sure you want to leave this session?')) {

  if (GameState.isHost || GameState.hasBuzzed) return;    showWelcomeScreen();

  sendMessage({ type: 'buzz' });  }

}}



/**// ============================================

 * End current round (host only)// Initialize

 */// ============================================

function endRound() {

  if (!GameState.isHost) return;window.onload = () => {

  sendMessage({ type: 'endRound' });  showWelcomeScreen();

}  console.log('🎯 Buzzer Game Event System - Ready');

};

/**
 * Copy game code to clipboard
 */
function copyCode() {
  navigator.clipboard.writeText(GameState.gameCode).then(() => {
    const btn = event.target;
    const original = btn.textContent;
    btn.textContent = '✓ COPIED!';
    setTimeout(() => {
      btn.textContent = original;
    }, 2000);
  });
}

// ============================================
// Initialization
// ============================================

// Start WebSocket connection on page load
initWebSocket();
