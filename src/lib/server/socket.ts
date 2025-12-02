import { Server } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { gameManager } from './game-manager';

export function setupSocketIO(httpServer: HTTPServer) {
	console.log('🔧 Socket.IO setup - gameManager instance:', gameManager.constructor.name);
	const io = new Server(httpServer, {
		cors: {
			origin: process.env.CORS_ORIGIN || '*',
			methods: ['GET', 'POST']
		}
	});

	io.on('connection', (socket) => {
		console.log('Client connected:', socket.id);

		socket.on('host:join', (gameId: string) => {
			socket.join(`game:${gameId}:host`);
			socket.emit('host:joined', { gameId });
		});

	socket.on('player:join', ({ gameId, playerName }: { gameId: string; playerName: string }) => {
		console.log(`🎮 Player attempting to join - Name: "${playerName}", GameID: "${gameId}"`);
		
		// Debug: List all games
		const allGames = (gameManager as any).games;
		const gameIds = Array.from(allGames.keys());
		console.log(`🗂️  All games in memory: ${gameIds.join(', ') || 'NONE'}`);
		console.log(`🔍 Looking for game: "${gameId}"`);
		
		const game = gameManager.getGame(gameId);
		console.log(`📊 Game status - Exists: ${!!game}, Phase: ${game?.phase || 'N/A'}`);
		
		const result = gameManager.addPlayer(gameId, playerName);
		if (result) {
			socket.join(`game:${gameId}:players`);
			socket.data.playerId = result.playerId;
			socket.data.gameId = gameId;
			
			socket.emit('player:joined', result);
			io.to(`game:${gameId}:host`).emit('player:added', result.player);
			console.log(`✅ Player "${playerName}" joined successfully with ID: ${result.playerId}`);
		} else {
			console.log(`❌ Failed to add player "${playerName}" to game "${gameId}"`);
			socket.emit('error', { message: 'Failed to join game' });
		}
	});		socket.on('host:start-game', (gameId: string) => {
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

		socket.on('host:start-answering', (gameId: string) => {
			if (gameManager.startAnswering(gameId)) {
				const game = gameManager.getGame(gameId);
				io.to(`game:${gameId}:host`).to(`game:${gameId}:players`).emit('game:state-update', game);
			}
		});

		socket.on('player:submit-answer', ({ answerIndices }: { answerIndices: number[] }) => {
			const gameId = socket.data.gameId;
			const playerId = socket.data.playerId;
			
			if (gameId && playerId) {
				if (gameManager.submitAnswer(gameId, playerId, answerIndices)) {
					socket.emit('answer:submitted', { answerIndices });
					io.to(`game:${gameId}:host`).emit('player:answered', { playerId });
				}
			}
		});

		socket.on('host:show-scoreboard', (gameId: string) => {
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

		socket.on('host:next-question', (gameId: string) => {
			if (gameManager.nextQuestion(gameId)) {
				const game = gameManager.getGame(gameId);
				
				// If we've reached the leaderboard phase (final results), send leaderboard data
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

		socket.on('host:end-game', (gameId: string) => {
			if (gameManager.endGame(gameId)) {
				const game = gameManager.getGame(gameId);
				const leaderboard = gameManager.getLeaderboard(gameId);
				// Broadcast final state and leaderboard so UIs can transition
				io.to(`game:${gameId}:host`).to(`game:${gameId}:players`).emit('game:ended', {
					game,
					leaderboard
				});
				// Also emit a state update to set phase to 'finished' in all clients
				io.to(`game:${gameId}:host`).to(`game:${gameId}:players`).emit('game:state-update', game);
			}
		});

		socket.on('disconnect', () => {
			console.log('Client disconnected:', socket.id);
		});
	});

	return io;
}
