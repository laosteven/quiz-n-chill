import { handler } from './build/handler.js';
import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { nanoid } from 'nanoid';

const app = express();
const server = createServer(app);
const io = new Server(server, {
	cors: {
		origin: process.env.CORS_ORIGIN || '*',
		methods: ['GET', 'POST']
	}
});

// In-memory game state management
class GameManager {
	constructor() {
		this.games = new Map();
	}

	createGame(config) {
		const gameId = nanoid(4);
		const gameState = {
			gameId,
			config,
			currentQuestionIndex: -1,
			phase: 'lobby',
			players: {}
		};
		this.games.set(gameId, gameState);
		return gameId;
	}

	getGame(gameId) {
		return this.games.get(gameId);
	}

	addPlayer(gameId, playerName) {
		const game = this.games.get(gameId);
		if (!game || game.phase !== 'lobby') {
			return null;
		}

		const playerId = nanoid(10);
		const player = {
			id: playerId,
			name: playerName,
			score: 0,
			answers: {}
		};

		game.players[playerId] = player;
		return { playerId, player };
	}

	renamePlayer(gameId, playerId, newName) {
		const game = this.games.get(gameId);
		if (!game) return false;

		const player = game.players[playerId];
		if (!player) return false;

		player.name = newName;
		return true;
	}

	startGame(gameId) {
		const game = this.games.get(gameId);
		if (!game || game.phase !== 'lobby') {
			return false;
		}

		game.phase = 'question-reading';
		game.currentQuestionIndex = 0;
		game.questionStartTime = Date.now();
		return true;
	}

	startAnswering(gameId) {
		const game = this.games.get(gameId);
		if (!game || game.phase !== 'question-reading') {
			return false;
		}

		game.phase = 'question-answering';
		game.answerStartTime = Date.now();
		return true;
	}

	submitAnswer(gameId, playerId, answerIndices) {
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

	getAnsweredCount(gameId) {
		const game = this.games.get(gameId);
		if (!game || game.currentQuestionIndex < 0) {
			return 0;
		}

		return Object.values(game.players).filter(
			player => player.answers[game.currentQuestionIndex] !== undefined
		).length;
	}

	calculateScores(gameId) {
		const game = this.games.get(gameId);
		if (!game) return;

		const question = game.config.questions[game.currentQuestionIndex];
		const correctIndices = question.answers
			.map((a, i) => (a.correct ? i : -1))
			.filter(i => i !== -1);

		Object.values(game.players).forEach(player => {
			const playerAnswers = player.answers[game.currentQuestionIndex] || [];
			
			const isCorrect =
				playerAnswers.length === correctIndices.length &&
				playerAnswers.every(i => correctIndices.includes(i));

			if (isCorrect) {
				let points = game.config.settings.pointsPerCorrectAnswer;

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

	showScoreboard(gameId) {
		const game = this.games.get(gameId);
		if (!game) return false;

		game.phase = 'scoreboard';
		return true;
	}

	nextQuestion(gameId) {
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

	getLeaderboard(gameId) {
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

	endGame(gameId) {
		const game = this.games.get(gameId);
		if (!game) return false;

		game.phase = 'finished';
		return true;
	}

	deleteGame(gameId) {
		return this.games.delete(gameId);
	}
}

const gameManager = new GameManager();

// Make gameManager available globally for API routes
global.gameManager = gameManager;

// Socket.IO event handlers
io.on('connection', (socket) => {
	console.log('Client connected:', socket.id);

	socket.on('host:join', (gameId) => {
		socket.join(`game:${gameId}:host`);
		socket.emit('host:joined', { gameId });
	});

	socket.on('player:join', ({ gameId, playerName }) => {
		const result = gameManager.addPlayer(gameId, playerName);
		if (result) {
			socket.join(`game:${gameId}:players`);
			socket.data.playerId = result.playerId;
			socket.data.gameId = gameId;
			
			socket.emit('player:joined', result);
			io.to(`game:${gameId}:host`).emit('player:added', result.player);
		} else {
			socket.emit('error', { message: 'Failed to join game' });
		}
	});

	socket.on('host:start-game', (gameId) => {
		if (gameManager.startGame(gameId)) {
			const game = gameManager.getGame(gameId);
			io.to(`game:${gameId}:host`).to(`game:${gameId}:players`).emit('game:started', game);
			
			const question = game?.config.questions[0];
			if (question) {
				setTimeout(() => {
					if (gameManager.startAnswering(gameId)) {
						const updatedGame = gameManager.getGame(gameId);
						io.to(`game:${gameId}:host`).to(`game:${gameId}:players`).emit('game:state-update', updatedGame);
					}
				}, question.readTime * 1000);
			}
		}
	});

	socket.on('host:start-answering', (gameId) => {
		if (gameManager.startAnswering(gameId)) {
			const game = gameManager.getGame(gameId);
			io.to(`game:${gameId}:host`).to(`game:${gameId}:players`).emit('game:state-update', game);
		}
	});

	socket.on('player:submit-answer', ({ answerIndices }) => {
		const gameId = socket.data.gameId;
		const playerId = socket.data.playerId;
		
		if (gameId && playerId) {
			if (gameManager.submitAnswer(gameId, playerId, answerIndices)) {
				socket.emit('answer:submitted', { answerIndices });
				
				const answeredCount = gameManager.getAnsweredCount(gameId);
				const game = gameManager.getGame(gameId);
				const totalPlayers = game ? Object.keys(game.players).length : 0;
				
				io.to(`game:${gameId}:host`).to(`game:${gameId}:players`).emit('player:answered', { 
					playerId, 
					answeredCount, 
					totalPlayers 
				});

				// Auto-proceed if all players have answered and setting is enabled
				if (game && game.config.settings.autoProceedWhenAllAnswered && answeredCount === totalPlayers) {
					setTimeout(() => {
						gameManager.calculateScores(gameId);
						if (gameManager.showScoreboard(gameId)) {
							const updatedGame = gameManager.getGame(gameId);
							const leaderboard = gameManager.getLeaderboard(gameId);
							io.to(`game:${gameId}:host`).to(`game:${gameId}:players`).emit('game:scoreboard', {
								game: updatedGame,
								leaderboard
							});
						}
					}, 1000);
				}
			}
		}
	});

	socket.on('player:rename', ({ newName }) => {
		const gameId = socket.data.gameId;
		const playerId = socket.data.playerId;
		
		if (gameId && playerId && newName.trim()) {
			if (gameManager.renamePlayer(gameId, playerId, newName.trim())) {
				const game = gameManager.getGame(gameId);
				io.to(`game:${gameId}:host`).to(`game:${gameId}:players`).emit('game:state-update', game);
			}
		}
	});

	socket.on('host:rename-player', ({ playerId, newName }) => {
		const gameId = socket.data.gameId;
		
		if (!gameId) {
			const rooms = Array.from(socket.rooms);
			const hostRoom = rooms.find(room => room.startsWith('game:') && room.endsWith(':host'));
			if (hostRoom) {
				const extractedGameId = hostRoom.replace('game:', '').replace(':host', '');
				if (extractedGameId && newName.trim()) {
					const oldName = gameManager.getGame(extractedGameId)?.players[playerId]?.name;
					if (gameManager.renamePlayer(extractedGameId, playerId, newName.trim())) {
						const game = gameManager.getGame(extractedGameId);
						io.to(`game:${extractedGameId}:host`).to(`game:${extractedGameId}:players`).emit('game:state-update', game);
						socket.emit('player:renamed', { playerId, oldName, newName: newName.trim() });
					}
				}
			}
		} else if (newName.trim()) {
			const oldName = gameManager.getGame(gameId)?.players[playerId]?.name;
			if (gameManager.renamePlayer(gameId, playerId, newName.trim())) {
				const game = gameManager.getGame(gameId);
				io.to(`game:${gameId}:host`).to(`game:${gameId}:players`).emit('game:state-update', game);
				socket.emit('player:renamed', { playerId, oldName, newName: newName.trim() });
			}
		}
	});

	socket.on('host:show-scoreboard', (gameId) => {
		gameManager.calculateScores(gameId);
		if (gameManager.showScoreboard(gameId)) {
			const game = gameManager.getGame(gameId);
			const leaderboard = gameManager.getLeaderboard(gameId);
			io.to(`game:${gameId}:host`).to(`game:${gameId}:players`).emit('game:scoreboard', {
				game,
				leaderboard
			});
		}
	});

	socket.on('host:next-question', (gameId) => {
		if (gameManager.nextQuestion(gameId)) {
			const game = gameManager.getGame(gameId);
			
			if (game?.phase === 'leaderboard') {
				const leaderboard = gameManager.getLeaderboard(gameId);
				io.to(`game:${gameId}:host`).to(`game:${gameId}:players`).emit('game:scoreboard', {
					game,
					leaderboard
				});
			} else {
				io.to(`game:${gameId}:host`).to(`game:${gameId}:players`).emit('game:state-update', game);
				
				if (game?.phase === 'question-reading') {
					const question = game.config.questions[game.currentQuestionIndex];
					setTimeout(() => {
						if (gameManager.startAnswering(gameId)) {
							const updatedGame = gameManager.getGame(gameId);
							io.to(`game:${gameId}:host`).to(`game:${gameId}:players`).emit('game:state-update', updatedGame);
						}
					}, question.readTime * 1000);
				}
			}
		}
	});

	socket.on('host:end-game', (gameId) => {
		if (gameManager.endGame(gameId)) {
			const game = gameManager.getGame(gameId);
			const leaderboard = gameManager.getLeaderboard(gameId);
			io.to(`game:${gameId}:host`).to(`game:${gameId}:players`).emit('game:ended', {
				game,
				leaderboard
			});
			io.to(`game:${gameId}:host`).to(`game:${gameId}:players`).emit('game:state-update', game);
		}
	});

	socket.on('disconnect', () => {
		console.log('Client disconnected:', socket.id);
	});
});

// SvelteKit handler
app.use(handler);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});
