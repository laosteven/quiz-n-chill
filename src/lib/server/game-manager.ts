import type { GameConfig, GameState, LeaderboardEntry, Player } from "$lib/types";
import { nanoid } from "nanoid";
import { PlayerService } from "./services/player.service";

// Use globalThis to ensure single instance across all module resolutions
const GAME_MANAGER_KEY = Symbol.for("quiz-n-chill.gameManager");

export class GameManager {
  private games: Map<string, GameState> = new Map();
  private playerServices: Map<string, PlayerService> = new Map(); // per-game player service

  constructor() {
    // Enforce singleton pattern using globalThis
    const globalAny = globalThis as any;
    if (globalAny[GAME_MANAGER_KEY]) {
      console.log("⚠️  Reusing existing GameManager instance");
      return globalAny[GAME_MANAGER_KEY];
    }
    globalAny[GAME_MANAGER_KEY] = this;
    console.log("✨ Created new GameManager instance");
  }

  createGame(config: GameConfig): string {
    const gameId = nanoid(4);
    const gameState: GameState = {
      gameId,
      config,
      currentQuestionIndex: -1,
      phase: "lobby",
      players: {},
    };
    this.games.set(gameId, gameState);
    this.playerServices.set(gameId, new PlayerService());
    return gameId;
  }

  getGame(gameId: string): GameState | undefined {
    return this.games.get(gameId);
  }

  getPlayerService(gameId: string): PlayerService | undefined {
    return this.playerServices.get(gameId);
  }

  /**
   * Find the gameId that contains a player with the given socket/player id
   */
  findGameByPlayerId(playerId: string): string | undefined {
    for (const [gameId, game] of this.games.entries()) {
      if (game.players && game.players[playerId]) {
        return gameId;
      }
    }
    return undefined;
  }

  addPlayer(
    gameId: string,
    playerId: string,
    playerName: string
  ): { playerId: string; player: Player } | null {
    const game = this.games.get(gameId);
    const playerService = this.playerServices.get(gameId);

    if (!game || !playerService) {
      console.log(`addPlayer failed: game or playerService not found for ${gameId}`);
      return null;
    }

    const cleanName = playerName.trim();

    // Check if username is taken by a connected player
    if (playerService.isUsernameTaken(cleanName)) {
      return null;
    }

    // Check for disconnected player with same name and remove them
    const disconnectedPlayer = playerService.findDisconnectedPlayer(cleanName);
    if (disconnectedPlayer) {
      console.log(
        `Removing disconnected player "${disconnectedPlayer.name}" to allow new connection`
      );
      playerService.removePlayer(disconnectedPlayer.id);
      delete game.players[disconnectedPlayer.id];
    }

    // Add the new player with score restoration
    const restoredScore = playerService.getStoredScore(cleanName);
    const player = playerService.addPlayer(playerId, cleanName, restoredScore);

    game.players[playerId] = player;

    console.log(`Player joined: ${cleanName} (restored score: ${restoredScore})`);

    return { playerId, player };
  }

  /**
   * Check if a player can join; returns ok and optional reason
   */
  canJoin(gameId: string, playerName: string): { ok: boolean; reason?: string } {
    const game = this.games.get(gameId);
    const playerService = this.playerServices.get(gameId);

    if (!game) return { ok: false, reason: "Game not found" };
    if (!playerService) return { ok: false, reason: "Internal server error" };

    const cleanName = playerName.trim();
    if (playerService.isUsernameTaken(cleanName))
      return { ok: false, reason: "Username already taken" };

    return { ok: true };
  }

  startGame(gameId: string): boolean {
    const game = this.games.get(gameId);
    if (!game || game.phase !== "lobby") {
      return false;
    }

    game.phase = "question-reading";
    game.currentQuestionIndex = 0;
    game.questionStartTime = Date.now();
    return true;
  }

  startAnswering(gameId: string): boolean {
    const game = this.games.get(gameId);
    if (!game || game.phase !== "question-reading") {
      return false;
    }

    game.phase = "question-answering";
    game.answerStartTime = Date.now();
    return true;
  }

  revealAnswers(gameId: string): boolean {
    const game = this.games.get(gameId);
    if (!game || (game.phase !== "question-answering" && game.phase !== "question-reading")) {
      return false;
    }

    game.phase = "answer-review";
    return true;
  }

  submitAnswer(gameId: string, playerId: string, answerIndices: number[]): boolean {
    const game = this.games.get(gameId);
    if (!game || game.phase !== "question-answering") {
      return false;
    }

    const player = game.players[playerId];
    if (!player) {
      return false;
    }

    player.answers[game.currentQuestionIndex] = answerIndices;

    // Track when the player submitted their answer
    if (!player.answerTimes) {
      player.answerTimes = {};
    }
    player.answerTimes[game.currentQuestionIndex] = Date.now();

    return true;
  }

  getAnsweredCount(gameId: string): number {
    const game = this.games.get(gameId);
    if (!game || game.currentQuestionIndex < 0) {
      return 0;
    }

    return Object.values(game.players).filter(
      (player) => player.answers[game.currentQuestionIndex] !== undefined
    ).length;
  }

  renamePlayer(
    gameId: string,
    playerId: string,
    newName: string
  ): { success: boolean; error?: string } {
    const game = this.games.get(gameId);
    const playerService = this.playerServices.get(gameId);

    if (!game || !playerService) {
      return { success: false, error: "Game not found" };
    }

    const player = game.players[playerId];
    if (!player) {
      return { success: false, error: "Player not found" };
    }

    const cleanName = newName.trim();

    // Check if new username is taken by another active player
    if (playerService.isUsernameTaken(cleanName, playerId)) {
      return { success: false, error: "Username already taken" };
    }

    // Update in player service and game state
    playerService.updatePlayerName(playerId, cleanName);
    player.name = cleanName;

    return { success: true };
  }

  markPlayerDisconnected(gameId: string, playerId: string): boolean {
    const game = this.games.get(gameId);
    const playerService = this.playerServices.get(gameId);

    if (!game || !playerService) {
      return false;
    }

    const player = game.players[playerId];
    if (!player) {
      return false;
    }

    playerService.markDisconnected(playerId);
    if (game.players[playerId]) {
      game.players[playerId].connected = false;
    }

    console.log(`Player disconnected: ${player.name}`);
    return true;
  }

  clearDisconnectedPlayers(gameId: string): number {
    const game = this.games.get(gameId);
    const playerService = this.playerServices.get(gameId);

    if (!game || !playerService) {
      return 0;
    }

    const disconnectedIds: string[] = [];
    for (const [id, player] of Object.entries(game.players)) {
      if (player.connected === false) {
        disconnectedIds.push(id);
      }
    }

    disconnectedIds.forEach((id) => {
      playerService.removePlayer(id);
      delete game.players[id];
    });

    return disconnectedIds.length;
  }

  calculateScores(gameId: string): void {
    const game = this.games.get(gameId);
    if (!game) return;

    const question = game.config.questions[game.currentQuestionIndex];
    const correctIndices = question.answers
      .map((a, i) => (a.correct ? i : -1))
      .filter((i) => i !== -1);

    Object.values(game.players).forEach((player) => {
      const playerAnswers = player.answers[game.currentQuestionIndex] || [];

      let points = 0;

      if (question.answerType === "single") {
        // Single choice: all or nothing
        const isCorrect =
          playerAnswers.length === correctIndices.length &&
          playerAnswers.every((i) => correctIndices.includes(i));

        if (isCorrect) {
          points = game.config.settings.pointsPerCorrectAnswer;
        }
      } else {
        // Multiple choice: partial scoring
        const correctSelected = playerAnswers.filter((i) => correctIndices.includes(i)).length;
        const incorrectSelected = playerAnswers.filter((i) => !correctIndices.includes(i)).length;
        const totalCorrect = correctIndices.length;

        if (correctSelected > 0) {
          // Base points: proportion of correct answers selected
          const basePoints =
            (correctSelected / totalCorrect) * game.config.settings.pointsPerCorrectAnswer;

          // Penalty for incorrect selections (reduce points by percentage)
          const penaltyFactor = Math.max(0, 1 - incorrectSelected * 0.25); // 25% penalty per wrong answer

          points = Math.floor(basePoints * penaltyFactor);
        }
      }

      if (points > 0) {
        // Time bonus (only applied if player gets some points)
        if (game.config.settings.timeBonus && game.answerStartTime) {
          const answerTime = player.answerTimes?.[game.currentQuestionIndex];
          if (answerTime && answerTime >= game.answerStartTime) {
            const timeElapsed = (answerTime - game.answerStartTime) / 1000;
            const timeRemaining = Math.max(0, question.timeLimit - timeElapsed);
            const timeBonus = Math.max(0, Math.floor((timeRemaining / question.timeLimit) * 500));
            points += timeBonus;
          }
          // If no answer time recorded, no time bonus (shouldn't happen with proper tracking)
        }

        player.score += points;
      }
    });
  }

  showScoreboard(gameId: string): boolean {
    const game = this.games.get(gameId);
    if (!game) return false;

    game.phase = "scoreboard";
    return true;
  }

  getAnswerCounts(gameId: string): Record<number, number> {
    const game = this.games.get(gameId);
    if (!game || game.currentQuestionIndex < 0) {
      return {};
    }

    const counts: Record<number, number> = {};
    Object.values(game.players).forEach((p) => {
      const ans = p.answers[game.currentQuestionIndex] || [];
      ans.forEach((i) => {
        counts[i] = (counts[i] || 0) + 1;
      });
    });

    return counts;
  }

  nextQuestion(gameId: string): boolean {
    const game = this.games.get(gameId);
    if (!game) return false;

    game.currentQuestionIndex++;

    if (game.currentQuestionIndex >= game.config.questions.length) {
      game.phase = "leaderboard";
      return true;
    }

    game.phase = "question-reading";
    game.questionStartTime = Date.now();
    game.answerStartTime = undefined;
    return true;
  }

  getLeaderboard(gameId: string): LeaderboardEntry[] {
    const game = this.games.get(gameId);
    if (!game) return [];

    const entries = Object.values(game.players)
      .map((player) => ({
        playerId: player.id,
        playerName: player.name,
        score: player.score,
      }))
      .sort((a, b) => b.score - a.score);

    return entries.map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
  }

  endGame(gameId: string): boolean {
    const game = this.games.get(gameId);
    if (!game) return false;

    game.phase = "finished";
    return true;
  }

  deleteGame(gameId: string): boolean {
    return this.games.delete(gameId);
  }
}

export const gameManager = new GameManager();
