import type { Server as HTTPServer } from "http";
import { Server as SocketIOServer, type Socket } from "socket.io";
import { gameManager } from "./game-manager";

let io: SocketIOServer | null = null;

function broadcastGameState(gameId: string) {
  if (!io) return;
  const game = gameManager.getGame(gameId);
  if (game) {
    io.to(`game:${gameId}:host`).to(`game:${gameId}:players`).emit("game:state-update", game);
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
      const can = gameManager.canJoin(gameId, playerName);
      if (!can.ok) {
        socket.emit("error", { message: can.reason || "Cannot join" });
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
        socket.emit("error", { message: "Failed to add player" });
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
        io!.to(`game:${gameId}:host`).to(`game:${gameId}:players`).emit("game:started", game);

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

    socket.on("host:start-answering", (gameId: string) => {
      if (gameManager.startAnswering(gameId)) {
        broadcastGameState(gameId);
      }
    });

    socket.on("player:submit-answer", ({ answerIndices }: { answerIndices: number[] }) => {
      const gameId = socket.data.gameId;
      const playerId = socket.data.playerId;

      if (gameId && playerId) {
        if (gameManager.submitAnswer(gameId, playerId, answerIndices)) {
          socket.emit("answer:submitted", { answerIndices });

          const answeredCount = gameManager.getAnsweredCount(gameId);
          const game = gameManager.getGame(gameId);
          const totalPlayers = game ? Object.keys(game.players).length : 0;

          io!.to(`game:${gameId}:host`).to(`game:${gameId}:players`).emit("player:answered", {
            playerId,
            answeredCount,
            totalPlayers,
          });

          // Auto-proceed if enabled and all answered
          if (
            game &&
            game.config.settings.autoProceedWhenAllAnswered &&
            answeredCount === totalPlayers
          ) {
            setTimeout(() => {
              gameManager.calculateScores(gameId);
              if (gameManager.showScoreboard(gameId)) {
                const updatedGame = gameManager.getGame(gameId);
                const leaderboard = gameManager.getLeaderboard(gameId);
                io!.to(`game:${gameId}:host`).to(`game:${gameId}:players`).emit("game:scoreboard", {
                  game: updatedGame,
                  leaderboard,
                });
              }
            }, 1000);
          }
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
