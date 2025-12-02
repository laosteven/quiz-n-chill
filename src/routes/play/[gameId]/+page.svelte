<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { io, type Socket } from 'socket.io-client';
	import type { GameState, Player } from '$lib/types';

	let socket: Socket;
	let game = $state<GameState | null>(null);
	let player = $state<Player | null>(null);
	let playerName = $state('');
	let joined = $state(false);
	let selectedAnswers = $state<number[]>([]);
	let hasSubmitted = $state(false);
	
	const gameId = $page.params.gameId;

	onMount(() => {
		console.log('🔌 Connecting to Socket.IO...');
		socket = io({
			transports: ['websocket', 'polling']
		});

		socket.on('connect', () => {
			console.log('✅ Connected to Socket.IO server:', socket.id);
		});

		socket.on('connect_error', (error) => {
			console.error('❌ Socket.IO connection error:', error);
		});

		socket.on('player:joined', ({ playerId, player: p }: { playerId: string; player: Player }) => {
			console.log('✅ Player joined successfully:', playerId);
			player = p;
			joined = true;
			localStorage.setItem(`player:${gameId}`, JSON.stringify({ playerId, playerName: p.name }));
		});

		socket.on('game:started', (updatedGame: GameState) => {
			game = updatedGame;
		});

		socket.on('game:state-update', (updatedGame: GameState) => {
			game = updatedGame;
			if (game.phase === 'question-reading' || game.phase === 'question-answering') {
				hasSubmitted = false;
				selectedAnswers = [];
			}
		});

		socket.on('game:scoreboard', ({ game: updatedGame }) => {
			game = updatedGame;
		});

		socket.on('answer:submitted', () => {
			hasSubmitted = true;
		});

		socket.on('error', (error: { message: string }) => {
			console.error('❌ Server error:', error);
			alert(error.message);
		});

		// Check if already joined
		const stored = localStorage.getItem(`player:${gameId}`);
		if (stored) {
			const { playerId, playerName: name } = JSON.parse(stored);
			playerName = name;
			// Note: Would need to re-join properly, for now just show join form
		}
	});

	onDestroy(() => {
		if (socket) {
			socket.disconnect();
		}
	});

	function joinGame() {
		if (playerName.trim()) {
			console.log(`🎮 Attempting to join game "${gameId}" as "${playerName.trim()}"`);
			console.log('Socket connected:', socket?.connected);
			socket.emit('player:join', { gameId, playerName: playerName.trim() });
		}
	}

	function toggleAnswer(index: number) {
		if (hasSubmitted || !game || game.phase !== 'question-answering') return;

		const question = game.config.questions[game.currentQuestionIndex];
		
		if (question.answerType === 'single') {
			selectedAnswers = [index];
		} else {
			if (selectedAnswers.includes(index)) {
				selectedAnswers = selectedAnswers.filter(i => i !== index);
			} else {
				selectedAnswers = [...selectedAnswers, index];
			}
		}
	}

	function submitAnswer() {
		if (selectedAnswers.length > 0) {
			socket.emit('player:submit-answer', { answerIndices: selectedAnswers });
		}
	}

	let playerScore = $derived(game && player ? game.players[player.id]?.score || 0 : 0);
	let playerRank = $derived.by(() => {
		if (!game || !player) return 0;
		const scores = Object.values(game.players).map(p => p.score).sort((a, b) => b - a);
		return scores.indexOf(playerScore) + 1;
	});
</script>

<div class="min-h-screen bg-gradient-to-br from-pink-500 to-purple-600 p-4">
	<div class="max-w-2xl mx-auto">
		{#if !joined}
			<div class="bg-white rounded-lg shadow-xl p-8 mt-20">
				<h1 class="text-3xl font-bold mb-6 text-center">Join quiz</h1>
				<p class="text-gray-600 mb-4 text-center">Game code: <span class="font-mono font-bold text-purple-600">{gameId}</span></p>
				
				<div class="space-y-4">
					<input
						type="text"
						bind:value={playerName}
						placeholder="Enter your name"
						class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-600 focus:outline-none text-lg"
						onkeydown={(e) => e.key === 'Enter' && joinGame()}
					/>
					<button
						onclick={joinGame}
						disabled={!playerName.trim()}
						class="w-full bg-purple-600 text-white py-3 px-6 rounded-lg font-bold text-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
					>
						Join Game
					</button>
				</div>
			</div>
		{:else if game?.phase === 'lobby'}
			<div class="bg-white rounded-lg shadow-xl p-8 mt-20 text-center">
				<h2 class="text-2xl font-bold mb-4">Welcome, {player?.name}!</h2>
				<p class="text-gray-600 mb-4">Waiting for host to start the game...</p>
				<div class="animate-pulse text-4xl">⏳</div>
			</div>
		{:else if game?.phase === 'question-reading'}
			{@const question = game.config.questions[game.currentQuestionIndex]}
			<div class="bg-white rounded-lg shadow-xl p-8">
				<div class="mb-4 text-center">
					<span class="text-sm text-gray-600">Question {game.currentQuestionIndex + 1} of {game.config.questions.length}</span>
					<div class="mt-2">
						<span class="text-sm font-semibold text-purple-600">Your Score: {playerScore}</span>
					</div>
				</div>

				<h2 class="text-2xl font-bold mb-6 text-center">{question.question}</h2>

				{#if question.mediaType === 'image' && question.mediaUrl}
					<img src={question.mediaUrl} alt="Question media" class="max-w-full mx-auto rounded-lg mb-6" />
				{/if}

				<div class="text-center py-8">
					<p class="text-lg text-gray-600">Get ready to answer...</p>
					<div class="text-4xl animate-pulse mt-4">📖</div>
				</div>
			</div>
		{:else if game?.phase === 'question-answering'}
			{@const question = game.config.questions[game.currentQuestionIndex]}
			<div class="bg-white rounded-lg shadow-xl p-8">
				<div class="mb-4 text-center">
					<span class="text-sm text-gray-600">Question {game.currentQuestionIndex + 1} of {game.config.questions.length}</span>
					<div class="mt-2">
						<span class="text-sm font-semibold text-purple-600">Your Score: {playerScore}</span>
					</div>
				</div>

				<h2 class="text-xl font-bold mb-4 text-center">{question.question}</h2>

				{#if !hasSubmitted}
					<p class="text-sm text-gray-600 mb-4 text-center">
						{question.answerType === 'multiple' ? 'Select all correct answers' : 'Select one answer'}
					</p>

					<div class="space-y-3 mb-6">
						{#each question.answers as answer, i}
							<button
								onclick={() => toggleAnswer(i)}
								class="w-full p-4 rounded-lg border-2 text-left font-semibold transition-all {
									selectedAnswers.includes(i) 
										? 'border-purple-600 bg-purple-100' 
										: 'border-gray-300 bg-white hover:border-gray-400'
								}"
							>
								<span class="mr-2">{String.fromCharCode(65 + i)}.</span>
								{answer.text}
								{#if selectedAnswers.includes(i)}
									<span class="float-right text-purple-600">✓</span>
								{/if}
							</button>
						{/each}
					</div>

					<button
						onclick={submitAnswer}
						disabled={selectedAnswers.length === 0}
						class="w-full bg-green-600 text-white py-4 px-6 rounded-lg font-bold text-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
					>
						Submit Answer
					</button>
				{:else}
					<div class="text-center py-12">
						<div class="text-6xl mb-4">✅</div>
						<p class="text-xl font-bold text-green-600">Answer submitted!</p>
						<p class="text-gray-600 mt-2">Waiting for other players...</p>
					</div>
				{/if}
			</div>
		{:else if game?.phase === 'scoreboard'}
			<div class="bg-white rounded-lg shadow-xl p-8">
				<h2 class="text-2xl font-bold mb-6 text-center">Results</h2>
				
				<div class="text-center mb-6">
					<div class="text-5xl font-bold text-purple-600 mb-2">{playerScore}</div>
					<p class="text-gray-600">Your Score</p>
					<p class="text-sm text-gray-500 mt-2">Rank: #{playerRank}</p>
				</div>

				<div class="text-center py-4">
					<p class="text-gray-600">Get ready for the next question...</p>
				</div>
			</div>
		{:else if game?.phase === 'leaderboard'}
			<div class="bg-white rounded-lg shadow-xl p-8">
				<h2 class="text-2xl font-bold mb-6 text-center">Final results</h2>
				
				<div class="text-center mb-6">
					<div class="text-6xl mb-4">
						{#if playerRank === 1}
							🏆
						{:else if playerRank === 2}
							🥈
						{:else if playerRank === 3}
							🥉
						{:else}
							🎯
						{/if}
					</div>
					<div class="text-4xl font-bold text-purple-600 mb-2">{playerScore}</div>
					<p class="text-gray-600">Your final score</p>
					<p class="text-xl font-semibold mt-2">Rank: #{playerRank}</p>
				</div>

				<div class="text-center py-4">
					<p class="text-gray-600">Thanks for playing!</p>
				</div>
			</div>
		{:else if game?.phase === 'finished'}
			<div class="bg-white rounded-lg shadow-xl p-8 text-center">
				<h2 class="text-2xl font-bold mb-4">Game over!</h2>
				<p class="text-gray-600">Thanks for playing!</p>
			</div>
		{/if}
	</div>
</div>
