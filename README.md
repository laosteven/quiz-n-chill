# Quiz & Chill 🎮

A self-hosted Kahoot-like quiz application built with SvelteKit and Socket.IO. Create interactive quizzes with real-time multiplayer gameplay, perfect for classrooms, team building, or fun trivia nights!

## Screenshots

![Landing](https://i.imgur.com/sH9Ncax.png)

![Question](https://i.imgur.com/WClhLZI.png)

![Answers](https://i.imgur.com/s2W71rw.png)

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

### Using Docker Compose (Recommended)

Create the game directory folder

```bash
mkdir games
```

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
