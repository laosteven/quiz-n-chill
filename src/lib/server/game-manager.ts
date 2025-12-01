import type { GameState, GameConfig, Player, LeaderboardEntry } from '$lib/types';
import { nanoid } from 'nanoid';

export class GameManager {
	private games: Map<string, GameState> = new Map();

	createGame(config: GameConfig): string {
		const gameId = nanoid(8);
		const gameState: GameState = {
			gameId,
			config,
			currentQuestionIndex: -1,
			phase: 'lobby',
			players: {}
		};
		this.games.set(gameId, gameState);
		return gameId;
	}

	getGame(gameId: string): GameState | undefined {
		return this.games.get(gameId);
	}

	addPlayer(gameId: string, playerName: string): { playerId: string; player: Player } | null {
		const game = this.games.get(gameId);
		if (!game || game.phase !== 'lobby') {
			return null;
		}

		const playerId = nanoid(10);
		const player: Player = {
			id: playerId,
			name: playerName,
			score: 0,
			answers: {}
		};

		game.players[playerId] = player;
		return { playerId, player };
	}

	startGame(gameId: string): boolean {
		const game = this.games.get(gameId);
		if (!game || game.phase !== 'lobby') {
			return false;
		}

		game.phase = 'question-reading';
		game.currentQuestionIndex = 0;
		game.questionStartTime = Date.now();
		return true;
	}

	startAnswering(gameId: string): boolean {
		const game = this.games.get(gameId);
		if (!game || game.phase !== 'question-reading') {
			return false;
		}

		game.phase = 'question-answering';
		game.answerStartTime = Date.now();
		return true;
	}

	submitAnswer(gameId: string, playerId: string, answerIndices: number[]): boolean {
		const game = this.games.get(gameId);
		if (!game || game.phase !== 'question-answering') {
			return false;
		}

		const player = game.players[playerId];
		if (!player) {
			return false;
		}

		player.answers[game.currentQuestionIndex] = answerIndices;
		return true;
	}

	calculateScores(gameId: string): void {
		const game = this.games.get(gameId);
		if (!game) return;

		const question = game.config.questions[game.currentQuestionIndex];
		const correctIndices = question.answers
			.map((a, i) => (a.correct ? i : -1))
			.filter(i => i !== -1);

		Object.values(game.players).forEach(player => {
			const playerAnswers = player.answers[game.currentQuestionIndex] || [];
			
			// Check if answer is correct
			const isCorrect =
				playerAnswers.length === correctIndices.length &&
				playerAnswers.every(i => correctIndices.includes(i));

			if (isCorrect) {
				let points = game.config.settings.pointsPerCorrectAnswer;

				// Time bonus
				if (game.config.settings.timeBonus && game.answerStartTime) {
					const timeElapsed = (Date.now() - game.answerStartTime) / 1000;
					const timeRemaining = question.timeLimit - timeElapsed;
					const timeBonus = Math.max(0, Math.floor((timeRemaining / question.timeLimit) * 500));
					points += timeBonus;
				}

				player.score += points;
			}
		});
	}

	showScoreboard(gameId: string): boolean {
		const game = this.games.get(gameId);
		if (!game) return false;

		game.phase = 'scoreboard';
		return true;
	}

	nextQuestion(gameId: string): boolean {
		const game = this.games.get(gameId);
		if (!game) return false;

		game.currentQuestionIndex++;
		
		if (game.currentQuestionIndex >= game.config.questions.length) {
			game.phase = 'leaderboard';
			return true;
		}

		game.phase = 'question-reading';
		game.questionStartTime = Date.now();
		game.answerStartTime = undefined;
		return true;
	}

	getLeaderboard(gameId: string): LeaderboardEntry[] {
		const game = this.games.get(gameId);
		if (!game) return [];

		const entries = Object.values(game.players)
			.map(player => ({
				playerId: player.id,
				playerName: player.name,
				score: player.score
			}))
			.sort((a, b) => b.score - a.score);

		return entries.map((entry, index) => ({
			...entry,
			rank: index + 1
		}));
	}

	endGame(gameId: string): boolean {
		const game = this.games.get(gameId);
		if (!game) return false;

		game.phase = 'finished';
		return true;
	}

	deleteGame(gameId: string): boolean {
		return this.games.delete(gameId);
	}
}

export const gameManager = new GameManager();
