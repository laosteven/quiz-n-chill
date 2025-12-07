# Quiz & Chill 🎮

A self-hosted Kahoot-like quiz application built with SvelteKit and Socket.IO. Create interactive quizzes with real-time multiplayer gameplay, perfect for classrooms, team building, or fun trivia nights!

## Features ✨

- 🎯 **Host Controls**: Full game flow management from a dedicated host panel
- 📱 **Mobile-Friendly**: Players join via QR code or game code from any device
- ⚡ **Real-time Updates**: Live scoreboard and instant answer feedback via WebSocket
- 🖼️ **Rich Media**: Support for images (Imgur) and videos (YouTube)
- 📊 **Multiple Question Types**: Single choice and multiple choice answers
- 🏆 **Leaderboard**: Per-question scoreboards and final rankings
- ⏱️ **Time Controls**: Configurable read time and answer time limits
- 🎨 **Beautiful UI**: Modern, responsive design with Tailwind CSS

## Quick Start 🚀

## Quick Start

### Using Docker Compose (Recommended)

Get the `sample-game.yml` file

```bash
wget -O games/sample-game.yml https://raw.githubusercontent.com/laosteven/quiz-n-chill/refs/heads/master/games/sample-game.yaml
```

Get the docker compose file

```bash
wget -O docker-compose.yml https://raw.githubusercontent.com/laosteven/quiz-n-chill/refs/heads/master/docker-compose.prod.yml
```

Start the container:

```bash
docker compose up -d
```

Open `http://localhost:3000` in your browser

## Local Development

1. **Install dependencies**

```bash
npm install
```

2. **Configure environment (optional)**

```bash
cp .env.example .env
# Edit .env to set PORT, CORS_ORIGIN, etc.
```

3. **Run development server**

```bash
npm run dev
```

4. **Build for production**

```bash
npm run build
npm run preview
```

## Game Configuration 📝

Create YAML files in the `games/` directory to define your quizzes. See `games/sample-game.yaml` for an example.

### Configuration Schema

```yaml
name: "Your Quiz Name"
description: "Optional description"

settings:
  pointsPerCorrectAnswer: 1000
  timeBonus: true # Award bonus points for faster answers
  showLeaderboardAfterEachQuestion: true

questions:
  - question: "Your question text?"
    answerType: "single" # or "multiple"
    timeLimit: 20 # seconds to answer
    readTime: 3 # seconds to read before showing answers
    mediaType: "image" # optional: "image" or "video"
    mediaUrl: "https://i.imgur.com/example.jpg" # optional
    backgroundUrl: "https://i.imgur.com/bg.jpg" # optional
    answers:
      - text: "Answer 1"
        correct: false
      - text: "Answer 2"
        correct: true
      - text: "Answer 3"
        correct: false
      - text: "Answer 4"
        correct: false
```

## How to Play 🎲

### For Hosts

1. Go to the home page
2. Select a game configuration
3. Click "Create Game as Host"
4. Share the QR code or game code with players
5. Wait for players to join
6. Click "Start Game" when ready
7. Control the game flow through each question
8. View results and leaderboard

### For Players

1. Scan the QR code or visit the game URL
2. Enter your name
3. Wait for the host to start
4. Read the question during the reading phase
5. Select your answer(s) when they appear
6. Submit before time runs out
7. See your score and ranking after each question
8. View final leaderboard at the end

## Architecture 🏗️

- **Frontend**: SvelteKit 5 with TypeScript
- **Styling**: Tailwind CSS
- **Real-time**: Socket.IO for WebSocket communication
- **Server**: Node.js with SvelteKit adapter-node
- **Deployment**: Docker & Docker Compose

## Project Structure 📁

```
quiz-n-chill/
├── games/                    # Game configuration YAML files
│   └── sample-game.yaml
├── src/
│   ├── lib/
│   │   ├── server/
│   │   │   └── game-manager.ts  # Game state management
│   │   └── types.ts             # TypeScript interfaces
│   ├── routes/
│   │   ├── api/                 # API endpoints
│   │   ├── host/[gameId]/       # Host control panel
│   │   ├── play/[gameId]/       # Player interface
│   │   └── +page.svelte         # Home page
│   └── hooks.server.ts          # Socket.IO setup
├── Dockerfile                   # Production build
├── Dockerfile.dev              # Development build
├── docker-compose.yml          # Production compose
└── docker-compose.dev.yml      # Development compose
```

## Development 🛠️

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run check` - Type check with svelte-check

### Adding New Games

1. Create a new YAML file in the `games/` directory
2. Follow the configuration schema
3. The game will automatically appear in the home page dropdown

### Environment Variables

Create a `.env` file based on `.env.example`:

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment mode (development/production)
- `CORS_ORIGIN` - Allowed CORS origins. Set to `*` for development or specify your domain(s) for production (e.g., `https://yourdomain.com`)

## Deployment 🚀

### Docker Production

```bash
# Build and run
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Manual Deployment

```bash
# Build the application
npm run build

# Start the server
NODE_ENV=production node server.js
```

## Contributing 🤝

Contributions are welcome! Please feel free to submit pull requests or open issues.

## License 📄

MIT

## Acknowledgments 🙏

Inspired by Kahoot and the trivia-n-chill project.
