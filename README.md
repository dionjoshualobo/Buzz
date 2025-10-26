# 🎯 Buzzer Game System

A real-time multiplayer buzzer game with vintage newspaper-themed UI, perfect for events, quizzes, and competitions.

![Vintage Newspaper UI](https://img.shields.io/badge/Style-Vintage%20Newspaper-8B4513?style=for-the-badge)
![WebSocket](https://img.shields.io/badge/WebSocket-Real--time-00C7B7?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-14%2B-339933?style=for-the-badge&logo=nodedotjs)

## ✨ Features

- **🎮 Real-time Buzzing**: Lightning-fast WebSocket communication with millisecond precision
- **👥 Multi-player Support**: Host games with unique join codes
- **📊 Live Leaderboard**: Track average buzz times, total buzzes, and first-place finishes
- **🖥️ Dual Display**: Separate leaderboard screen for event projection
- **📰 Vintage UI**: Beautiful newspaper-themed interface with retro typography
- **🔄 Auto-reconnect**: Resilient WebSocket connection with automatic recovery
- **📱 Responsive Design**: Works on desktop and mobile devices

## 🚀 Quick Start

### Prerequisites

- Node.js 14.0.0 or higher
- npm (comes with Node.js)

### Installation & Running

```powershell
# Install dependencies (first time only)
npm install

# Start the server
npm start
```

### Access the Application

- **Main interface**: `http://localhost:3001`
- **Leaderboard display**: `http://localhost:3001/leaderboard`

> 💡 **For network access**: Use your computer's IP address instead of `localhost` (e.g., `http://192.168.1.100:3001`)

## 📖 How to Use

### For Event Hosts

1. **Navigate to** `http://localhost:3001`
2. **Click** "HOST A GAME"
3. **Share** the generated game code with participants
4. **Open leaderboard** on second screen: `http://localhost:3001/leaderboard?code=XXXXXX`
5. **Control rounds** using "START ROUND" and "END ROUND" buttons
6. **View** real-time buzzes and leaderboard statistics

### For Players

1. **Navigate to** `http://localhost:3001`
2. **Click** "JOIN A GAME"
3. **Enter** the game code provided by the host
4. **Enter** your name
5. **Wait** for host to start round
6. **Press** the buzz button as fast as possible!

### Leaderboard Display (For Events)

Access the dedicated fullscreen leaderboard:
```
http://localhost:3001/leaderboard?code=YOUR_GAME_CODE
```

This page features:
- ⚡ Live status indicator
- 🏆 Top 10 rankings with medals
- 📊 Statistics dashboard
- 🎨 Fullscreen vintage newspaper design

## 🏗️ Project Structure

```
d:\Code\Test\
├── server.js               # WebSocket & HTTP server
├── package.json            # NPM configuration
├── README.md               # This file
│
├── public/                 # Client-side files
│   ├── index.html          # Main game interface
│   ├── leaderboard.html    # Dedicated leaderboard display
│   └── js/
│       └── app.js          # Client-side game logic
│
├── config/                 # Configuration
│   └── config.js           # Server settings
│
└── docs/                   # Additional documentation
    ├── USAGE.md            # Event setup guide
    ├── STRUCTURE.md        # Detailed structure info
    └── QUICK-REF.md        # Quick reference
```

> 📚 **See `docs/USAGE.md` for detailed event setup instructions**

## ⚙️ Configuration

Edit `config/config.js` to customize:

```javascript
{
  server: {
    port: 3001,               // Server port
  },
  game: {
    codeLength: 6,            // Game code length
  },
  websocket: {
    reconnectDelay: 2000,     // Reconnection delay (ms)
  },
}
```

## 🎨 Customizing the UI

The UI uses **Tailwind CSS** with a custom newspaper theme. To modify colors:

1. **Edit** `public/index.html` or `public/leaderboard.html`
2. **Find** the color classes (e.g., `bg-[#f5e6d3]`)
3. **Replace** with your desired colors

### Current Color Palette

- **Paper**: `#f5e6d3` (vintage cream)
- **Ink**: `#1a1a1a` (dark black)
- **Red Stamp**: `#d32f2f` (crimson)
- **Blue Ink**: `#1565c0` (royal blue)

## 🛠️ Development

### Code Organization

All code is **fully documented** with JSDoc comments for easy maintenance.

- **`server.js`**: WebSocket server, game logic, HTTP routing
- **`public/js/app.js`**: Client state management, WebSocket communication, UI updates  
- **`public/index.html`**: Main interface with host/player screens
- **`public/leaderboard.html`**: Dedicated leaderboard display
- **`config/config.js`**: Customizable settings (port, delays, colors)

### Making Changes

1. **UI changes**: Edit files in `public/` → Refresh browser
2. **Server changes**: Edit `server.js` → Restart server (`Ctrl+C`, then `npm start`)
3. **Settings**: Edit `config/config.js` → Restart server

## 🔧 Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Port already in use | Change port: `$env:PORT=3002; npm start` |
| Players can't connect | Use IP address instead of localhost (find with `ipconfig`) |
| WebSocket connection failed | Check firewall allows port 3001 |
| Game code not working | Verify spelling (codes are case-insensitive) |

### Network Setup for Events

1. **Find your IP address**: Run `ipconfig` in PowerShell
2. **Share with participants**: `http://YOUR_IP:3001` (e.g., `http://192.168.1.100:3001`)
3. **Allow firewall**: Windows may prompt to allow Node.js network access

> 📖 **For detailed troubleshooting**, see `docs/USAGE.md`

## 📝 API Reference

### WebSocket Messages

#### Client → Server
| Message | Description | Required Fields |
|---------|-------------|-----------------|
| `createGame` | Create new game | - |
| `joinGame` | Join existing game | `code`, `name` |
| `startRound` | Start new round | - (host only) |
| `buzz` | Submit buzz | - (players only) |
| `endRound` | End current round | - (host only) |
| `requestUpdate` | Request game state | - |

#### Server → Client
| Message | Description | Data |
|---------|-------------|------|
| `gameCreated` | Game creation confirmation | `code`, `clientId` |
| `joinedGame` | Join confirmation | `code`, `clientId` |
| `participantJoined` | Player joined | `participants[]` |
| `roundStarted` | Round started | `roundNumber` |
| `buzzed` | Buzz received | `buzz`, `position` |
| `roundEnded` | Round ended | `leaderboard[]` |

> 🔍 **For detailed API documentation**, see code comments in `server.js` and `public/js/app.js`

## 📊 Leaderboard Ranking

Players are ranked by:
1. **Average Buzz Time** (lower is better)
2. **First Place Finishes** (tiebreaker)
3. **Total Buzzes** (participation)

## 🤝 Contributing

This is an event-focused project. Feel free to fork and customize for your events!

### Potential Enhancements
- [ ] Team mode support
- [ ] Sound effects for buzzes
- [ ] Persistent game history
- [ ] Admin password protection
- [ ] Custom theming system
- [ ] Export leaderboard as CSV

## � Documentation

- **README.md** (this file) - Quick start and overview
- **docs/USAGE.md** - Detailed event setup guide
- **docs/STRUCTURE.md** - Project architecture
- **docs/QUICK-REF.md** - Command reference

## �📄 License

MIT License - Feel free to use for your events!

## 🙏 Credits

- **Design Inspiration**: Vintage newspaper advertisements
- **Fonts**: Google Fonts (Anton, Bebas Neue, Archivo Black, Roboto Condensed)
- **Framework**: Tailwind CSS
- **WebSocket**: ws library

---

**Made with ❤️ for event organizers and quiz masters**
