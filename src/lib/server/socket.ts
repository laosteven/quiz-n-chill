import type { Server as HTTPServer } from "http";
import { Server as SocketIOServer, type Socket } from "socket.io";
import { gameManager } from "./game-manager";

let io: SocketIOServer | null = null;

function broadcastGameState(gameId: string) {
  if (!io) return;
  const game = gameManager.getGame(gameId);
  if (game) {
    // Send full state to host, but sanitize for players to avoid leaking correct answers
    const sanitizeForPlayers = (g: any, includeCorrect = false) => {
      const copy = JSON.parse(JSON.stringify(g));
      if (!includeCorrect && copy.config && Array.isArray(copy.config.questions)) {
        copy.config.questions.forEach((q: any) => {
          if (q.answers && Array.isArray(q.answers)) {
            q.answers = q.answers.map((a: any) => ({ text: a.text }));
          }
        });
      }
      return copy;
    };

    // During answer-review and leaderboard phases, players need to see correct answers
    const shouldIncludeCorrect = game.phase === "answer-review" || game.phase === "leaderboard";

    io.to(`game:${gameId}:host`).emit("game:state-update", game);
    io.to(`game:${gameId}:players`).emit(
      "game:state-update",
      sanitizeForPlayers(game, shouldIncludeCorrect)
    );
  }
}

export function initSocketServer(httpServer: HTTPServer) {
  if (io) return io;

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST"],
    },
  });

  console.log("✨ Socket.IO server initialized");

  io.on("connection", (socket: Socket) => {
    console.log("Client connected:", socket.id);

    // Host joins
    socket.on("host:join", (gameId: string) => {
      socket.join(`game:${gameId}:host`);
      socket.emit("host:joined", { gameId });
    });

    // Player joins with duplicate checking
    socket.on("player:join", ({ gameId, playerName }: { gameId: string; playerName: string }) => {
      console.log(`Player join attempt: ${playerName} -> ${gameId}`);
      const can = gameManager.canJoin(gameId, playerName);
      if (!can.ok) {
        console.log(`Player join rejected: ${playerName} -> ${gameId} (${can.reason})`);
        socket.emit("player:join-failed", { message: can.reason || "Cannot join" });
        return;
      }

      const result = gameManager.addPlayer(gameId, socket.id, playerName);
      if (result) {
        socket.join(`game:${gameId}:players`);
        socket.data.playerId = result.playerId;
        socket.data.gameId = gameId;

        socket.emit("player:joined", result);
        io!.to(`game:${gameId}:host`).emit("player:added", result.player);
        broadcastGameState(gameId);
      } else {
        console.log(`Failed to add player ${playerName} to game ${gameId}`);
        socket.emit("player:join-failed", { message: "Failed to add player" });
      }
    });

    // Player renames themselves
    socket.on("player:rename", ({ newName }: { newName: string }) => {
      const gameId = socket.data.gameId;
      const playerId = socket.data.playerId;

      if (gameId && playerId) {
        const result = gameManager.renamePlayer(gameId, playerId, newName);
        if (result.success) {
          broadcastGameState(gameId);
        } else {
          socket.emit("error", { message: result.error || "Failed to rename" });
        }
      }
    });

    // Host renames a player
    socket.on(
      "host:rename-player",
      ({ playerId, newName }: { playerId: string; newName: string }) => {
        const rooms = Array.from(socket.rooms);
        const hostRoom = rooms.find((room) => room.startsWith("game:") && room.endsWith(":host"));
        if (!hostRoom) return;

        const gameId = hostRoom.replace("game:", "").replace(":host", "");
        const game = gameManager.getGame(gameId);
        const oldName = game?.players[playerId]?.name;

        const result = gameManager.renamePlayer(gameId, playerId, newName);
        if (result.success) {
          // Notify the player about the name change
          io!.to(playerId).emit("name:updated-by-host", {
            oldName,
            newName: newName.trim(),
            message: `Host updated your name from "${oldName}" to "${newName.trim()}"`,
          });

          socket.emit("player:renamed", { playerId, oldName, newName: newName.trim() });
          broadcastGameState(gameId);
        } else {
          socket.emit("error", { message: result.error || "Failed to rename player" });
        }
      }
    );

    // Game flow handlers
    socket.on("host:start-game", (gameId: string) => {
      if (gameManager.startGame(gameId)) {
        const game = gameManager.getGame(gameId);
        // Send full to host, sanitized to players
        const sanitizeForPlayers = (g: any) => {
          const copy = JSON.parse(JSON.stringify(g));
          copy.config.questions.forEach((q: any) => {
            q.answers = q.answers.map((a: any) => ({ text: a.text }));
          });
          return copy;
        };

        io!.to(`game:${gameId}:host`).emit("game:started", game);
        io!.to(`game:${gameId}:players`).emit("game:started", sanitizeForPlayers(game));

        const question = game?.config.questions[0];
        if (question) {
          setTimeout(() => {
            if (gameManager.startAnswering(gameId)) {
              broadcastGameState(gameId);
            }
          }, question.readTime * 1000);
        }
      }
    });

    // Host manually reveals answers (moves to answer-review phase)
    socket.on("host:reveal-answers", (gameId: string) => {
      console.log(`host:reveal-answers received from ${socket.id} for game ${gameId}`);
      if (gameManager.revealAnswers(gameId)) {
        // Emit explicit revealed answer indices to players so clients can highlight immediately
        const game = gameManager.getGame(gameId);
        const q = game?.config.questions?.[game.currentQuestionIndex];
        const correctIndices: number[] = [];
        if (q && Array.isArray(q.answers)) {
          q.answers.forEach((a: any, idx: number) => {
            if (a && a.correct) correctIndices.push(idx);
          });
        }
        console.log(`Revealed answers for game ${gameId}:`, correctIndices);
        io!.to(`game:${gameId}:players`).emit("answer:revealed", { answers: correctIndices });
        io!.to(`game:${gameId}:host`).emit("answer:revealed", { answers: correctIndices });

        broadcastGameState(gameId);
      }
    });

    socket.on("host:show-distribution", (gameId: string) => {
      console.log(`host:show-distribution received from ${socket.id} for game ${gameId}`);
      if (gameManager.showDistribution(gameId)) {
        broadcastGameState(gameId);
      }
    });

    socket.on("host:start-answering", (gameId: string) => {
      if (gameManager.startAnswering(gameId)) {
        broadcastGameState(gameId);
      }
    });

    socket.on("player:submit-answer", ({ answerIndices }: { answerIndices: number[] }) => {
      const gameId = socket.data.gameId;
      const playerId = socket.data.playerId;

      if (gameId && playerId) {
        const ok = gameManager.submitAnswer(gameId, playerId, answerIndices);
        if (ok) {
          socket.emit("answer:submitted", { answerIndices });

          const answeredCount = gameManager.getAnsweredCount(gameId);
          const game = gameManager.getGame(gameId);
          const totalPlayers = game ? Object.keys(game.players).length : 0;

          console.log(
            `player:submit-answer from ${playerId} in ${gameId}: answeredCount=${answeredCount}/${totalPlayers}`
          );

          io!.to(`game:${gameId}:host`).to(`game:${gameId}:players`).emit("player:answered", {
            playerId,
            answeredCount,
            totalPlayers,
          });

          // Broadcast updated game state (sanitized for players)
          broadcastGameState(gameId);

          // Auto-proceed if enabled and all answered
          if (
            game &&
            game.config.settings.autoProceedWhenAllAnswered &&
            answeredCount === totalPlayers
          ) {
            setTimeout(() => {
              if (gameManager.revealAnswers(gameId)) {
                // Emit correct answer indices to players (same as manual reveal)
                const updatedGame = gameManager.getGame(gameId);
                const q = updatedGame?.config.questions?.[updatedGame.currentQuestionIndex];
                const correctIndices: number[] = [];
                if (q && Array.isArray(q.answers)) {
                  q.answers.forEach((a: any, idx: number) => {
                    if (a && a.correct) correctIndices.push(idx);
                  });
                }
                console.log(`auto-proceed: revealed answers for game ${gameId}:`, correctIndices);
                io!
                  .to(`game:${gameId}:players`)
                  .emit("answer:revealed", { answers: correctIndices });
                io!.to(`game:${gameId}:host`).emit("answer:revealed", { answers: correctIndices });

                broadcastGameState(gameId);
                console.log(`auto-proceed: moved to answer-review phase for game ${gameId}`);
              }
            }, 1000);
          }
        } else {
          console.log(
            `submitAnswer failed for player ${playerId} in game ${gameId} (phase may be wrong or player missing)`
          );
        }
      }
    });

    socket.on("host:show-scoreboard", (gameId: string) => {
      gameManager.calculateScores(gameId);
      if (gameManager.showScoreboard(gameId)) {
        const game = gameManager.getGame(gameId);
        const leaderboard = gameManager.getLeaderboard(gameId);
        io!.to(`game:${gameId}:host`).to(`game:${gameId}:players`).emit("game:scoreboard", {
          game,
          leaderboard,
        });
      }
    });

    socket.on("host:next-question", (gameId: string) => {
      if (gameManager.nextQuestion(gameId)) {
        const game = gameManager.getGame(gameId);

        if (game?.phase === "leaderboard") {
          const leaderboard = gameManager.getLeaderboard(gameId);
          io!.to(`game:${gameId}:host`).to(`game:${gameId}:players`).emit("game:scoreboard", {
            game,
            leaderboard,
          });
        } else {
          broadcastGameState(gameId);

          if (game?.phase === "question-reading") {
            const question = game.config.questions[game.currentQuestionIndex];
            setTimeout(() => {
              if (gameManager.startAnswering(gameId)) {
                broadcastGameState(gameId);
              }
            }, question.readTime * 1000);
          }
        }
      }
    });

    socket.on("host:end-game", (gameId: string) => {
      if (gameManager.endGame(gameId)) {
        const game = gameManager.getGame(gameId);
        const leaderboard = gameManager.getLeaderboard(gameId);
        io!.to(`game:${gameId}:host`).to(`game:${gameId}:players`).emit("game:ended", {
          game,
          leaderboard,
        });
        broadcastGameState(gameId);
      }
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      let gameId = socket.data.gameId as string | undefined;
      let playerId = socket.data.playerId as string | undefined;

      // If socket.data wasn't populated (e.g. server restarted), try to find player by socket id
      if (!gameId || !playerId) {
        const foundGameId = gameManager.findGameByPlayerId(socket.id);
        if (foundGameId) {
          gameId = foundGameId;
          playerId = socket.id;
        }
      }

      if (gameId && playerId) {
        gameManager.markPlayerDisconnected(gameId, playerId);
        broadcastGameState(gameId);
      }

      console.log("Client disconnected:", socket.id);
    });
  });

  return io;
}

export function getIO() {
  return io;
}
