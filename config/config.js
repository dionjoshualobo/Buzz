/**
 * Configuration file for Buzzer Game
 * Modify these values to customize the game behavior
 */

module.exports = {
  // Server Configuration
  server: {
    port: process.env.PORT || 3001,
    publicDir: '../public',
  },

  // Game Settings
  game: {
    codeLength: 6,              // Length of game join codes
    autoCleanupDelay: 3600000,  // Remove empty games after 1 hour (ms)
  },

  // WebSocket Settings
  websocket: {
    reconnectDelay: 2000,       // Client reconnection delay (ms)
    maxReconnectAttempts: 5,    // Maximum reconnection attempts
    pingInterval: 30000,        // Keep-alive ping interval (ms)
  },

  // UI Theme (can be customized)
  theme: {
    colors: {
      paper: '#f5e6d3',
      ink: '#1a1a1a',
      redStamp: '#d32f2f',
      blueInk: '#1565c0',
    },
    fonts: {
      headline: 'Anton',
      subhead: 'Bebas Neue',
      emphasis: 'Archivo Black',
      body: 'Roboto Condensed',
    },
  },
};
