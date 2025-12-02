<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { io, type Socket } from 'socket.io-client';
	import type { GameState, LeaderboardEntry } from '$lib/types';
	import QRCode from 'qrcode';
	import { Toaster, toast } from 'svelte-sonner';

	let socket: Socket;
	let game = $state<GameState | null>(null);
	let leaderboard = $state<LeaderboardEntry[]>([]);
	let qrCodeUrl = $state('');
	let playerCount = $derived(game ? Object.keys(game.players).length : 0);
	let answeredCount = $state(0);
	let editingPlayerId = $state<string | null>(null);
	let editingPlayerName = $state('');
	let readTimeRemaining = $state(0);
	let answerTimeRemaining = $state(0);
	let readInterval: any;
	let answerInterval: any;
	
	const gameId = $page.params.gameId;
	const joinUrl = typeof window !== 'undefined' 
		? `${window.location.origin}/play/${gameId}` 
		: '';

	onMount(async () => {
		// Generate QR code
		if (joinUrl) {
			qrCodeUrl = await QRCode.toDataURL(joinUrl);
		}

		// Fetch initial game state
		const response = await fetch(`/api/games/${gameId}`);
		if (response.ok) {
			const data = await response.json();
			game = data.game;
		}

		// Connect to Socket.IO
		socket = io();
		socket.emit('host:join', gameId);

		socket.on('host:joined', () => {
			console.log('Joined as host');
		});

		socket.on('player:added', () => {
			// Refresh game state
			fetch(`/api/games/${gameId}`)
				.then(r => r.json())
				.then(data => game = data.game);
		});

		socket.on('game:started', (updatedGame: GameState) => {
			game = updatedGame;
			startReadTimer();
		});

		socket.on('game:state-update', (updatedGame: GameState) => {
			game = updatedGame;
			if (game.phase === 'question-reading') {
				startReadTimer();
			} else if (game.phase === 'question-answering') {
				startAnswerTimer();
			} else {
				clearTimers();
			}
		});

		socket.on('game:scoreboard', ({ game: updatedGame, leaderboard: lb }) => {
			game = updatedGame;
			leaderboard = lb;
			clearTimers();
		});

		socket.on('game:ended', ({ leaderboard: lb }) => {
			leaderboard = lb;
			clearTimers();
		});

		socket.on('player:answered', ({ answeredCount: count }: { answeredCount: number }) => {
			answeredCount = count;
		});

		socket.on('player:renamed', ({ oldName, newName }: { oldName: string; newName: string }) => {
			toast.success(`Renamed "${oldName}" to "${newName}"`);
		});
	});

	onDestroy(() => {
		clearTimers();
		if (socket) {
			socket.disconnect();
		}
	});

	function clearTimers() {
		if (readInterval) clearInterval(readInterval);
		if (answerInterval) clearInterval(answerInterval);
		readTimeRemaining = 0;
		answerTimeRemaining = 0;
	}

	function startReadTimer() {
		clearTimers();
		if (!game || !game.config.settings.showCountdown) return;
		
		const question = game.config.questions[game.currentQuestionIndex];
		readTimeRemaining = question.readTime;
		
		readInterval = setInterval(() => {
			readTimeRemaining--;
			if (readTimeRemaining <= 0) {
				clearInterval(readInterval);
			}
		}, 1000);
	}

	function startAnswerTimer() {
		clearTimers();
		if (!game || !game.config.settings.showCountdown) return;
		
		const question = game.config.questions[game.currentQuestionIndex];
		answerTimeRemaining = question.timeLimit;
		answeredCount = 0;
		
		answerInterval = setInterval(() => {
			answerTimeRemaining--;
			if (answerTimeRemaining <= 0) {
				clearInterval(answerInterval);
			}
		}, 1000);
	}

	function startGame() {
		socket.emit('host:start-game', gameId);
	}

	function startAnswering() {
		socket.emit('host:start-answering', gameId);
	}

	function showScoreboard() {
		socket.emit('host:show-scoreboard', gameId);
	}

	function nextQuestion() {
		socket.emit('host:next-question', gameId);
	}

	function endGame() {
		socket.emit('host:end-game', gameId);
	}

	function startEditingPlayer(playerId: string, currentName: string) {
		editingPlayerId = playerId;
		editingPlayerName = currentName;
	}

	function cancelEditing() {
		editingPlayerId = null;
		editingPlayerName = '';
	}

	function savePlayerName(playerId: string) {
		if (editingPlayerName.trim() && editingPlayerName.trim() !== game?.players[playerId]?.name) {
			socket.emit('host:rename-player', { playerId, newName: editingPlayerName.trim() });
		}
		cancelEditing();
	}

	function getYouTubeEmbedUrl(url: string): string {
		const videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/)?.[1];
		return videoId ? `https://www.youtube.com/embed/${videoId}` : '';
	}
</script>

<Toaster position="top-center" />

<div class="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 p-8">
	<div class="max-w-6xl mx-auto">
		<h1 class="text-4xl font-bold text-white mb-8 text-center">
			{game?.config.name || 'Quiz Game'} - Host panel
		</h1>

		{#if game?.phase === 'lobby'}
			<div class="bg-white rounded-lg shadow-xl p-8 mb-8">
				<h2 class="text-2xl font-bold mb-4">Waiting for players</h2>
				<p class="text-gray-600 mb-4">Game code: <span class="text-3xl font-mono font-bold text-purple-600">{gameId}</span></p>
				
				<div class="flex gap-8 items-start">
					<div class="flex-1">
						<p class="text-sm text-gray-600 mb-2">Scan QR code to join:</p>
						{#if qrCodeUrl}
							<img src={qrCodeUrl} alt="QR Code" class="w-64 h-64 border-4 border-gray-200 rounded-lg" />
						{/if}
					</div>

					<div class="flex-1">
						<p class="text-sm text-gray-600 mb-2">Or visit:</p>
						<p class="text-lg font-mono bg-gray-100 p-3 rounded break-all">{joinUrl}</p>
						
						<div class="mt-6">
							<p class="font-semibold mb-2">Players ({playerCount}):</p>
							<div class="space-y-2 max-h-64 overflow-y-auto">
								{#each Object.values(game.players) as player}
									<div class="bg-gray-100 p-3 rounded flex items-center justify-between">
										{#if editingPlayerId === player.id}
											<input
												type="text"
												bind:value={editingPlayerName}
												class="flex-1 px-2 py-1 border border-gray-300 rounded mr-2"
												onkeydown={(e) => {
													if (e.key === 'Enter') savePlayerName(player.id);
													if (e.key === 'Escape') cancelEditing();
												}}
												autofocus
											/>
											<button
												onclick={() => savePlayerName(player.id)}
												class="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 mr-1"
											>
												✓
											</button>
											<button
												onclick={cancelEditing}
												class="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
											>
												✕
											</button>
										{:else}
											<span>{player.name}</span>
											<button
												onclick={() => startEditingPlayer(player.id, player.name)}
												class="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
											>
												Rename
											</button>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					</div>
				</div>

				<button
					onclick={startGame}
					disabled={playerCount === 0}
					class="mt-6 w-full bg-green-600 text-white py-4 px-6 rounded-lg font-bold text-xl hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
				>
					Start game
				</button>
			</div>
		{/if}

		{#if game?.phase === 'question-reading' || game?.phase === 'question-answering'}
			{@const question = game.config.questions[game.currentQuestionIndex]}
			<div class="bg-white rounded-lg shadow-xl p-8 mb-8">
				<div class="mb-4 flex justify-between items-center">
					<span class="text-sm text-gray-600">Question {game.currentQuestionIndex + 1} of {game.config.questions.length}</span>
					<div class="flex gap-4 items-center">
						{#if game.phase === 'question-answering'}
							<span class="text-sm font-semibold text-blue-600">
								{answeredCount} / {playerCount} answered
							</span>
						{/if}
						{#if game.config.settings.showCountdown}
							<span class="text-lg font-bold text-purple-600">
								{game.phase === 'question-reading' ? readTimeRemaining : answerTimeRemaining}s
							</span>
						{/if}
					</div>
				</div>

				{#if question.backgroundUrl}
					<div class="absolute inset-0 opacity-20">
						<img src={question.backgroundUrl} alt="Background" class="w-full h-full object-cover" />
					</div>
				{/if}

				<h2 class="text-3xl font-bold mb-6 relative z-10">{question.question}</h2>

				{#if question.mediaType === 'image' && question.mediaUrl}
					<img src={question.mediaUrl} alt="Question media" class="max-w-md mx-auto rounded-lg mb-6" />
				{/if}

				{#if question.mediaType === 'video' && question.mediaUrl}
					<div class="max-w-2xl mx-auto mb-6">
						<iframe
							title="Question video"
							src={getYouTubeEmbedUrl(question.mediaUrl)}
							class="w-full aspect-video rounded-lg"
							frameborder="0"
							allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
							allowfullscreen
						></iframe>
					</div>
				{/if}

				{#if game.phase === 'question-reading'}
					<div class="text-center py-8">
						<p class="text-xl text-gray-600 mb-4">Reading time... Answers will appear soon!</p>
						<button
							onclick={startAnswering}
							class="bg-blue-600 text-white py-3 px-8 rounded-lg font-bold hover:bg-blue-700"
						>
							Show answers now
						</button>
					</div>
				{:else}
					<div class="grid grid-cols-2 gap-4 mb-6">
						{#each question.answers as answer, i}
							<div class="bg-gray-100 p-4 rounded-lg border-2 border-gray-300">
								<span class="font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
								{answer.text}
							</div>
						{/each}
					</div>

					<div class="flex gap-4">
						<button
							onclick={showScoreboard}
							class="flex-1 bg-orange-600 text-white py-3 px-6 rounded-lg font-bold hover:bg-orange-700"
						>
							Show results
						</button>
					</div>
				{/if}
			</div>
		{/if}

		{#if game?.phase === 'scoreboard'}
			{@const question = game.config.questions[game.currentQuestionIndex]}
			<div class="bg-white rounded-lg shadow-xl p-8 mb-8">
				<h2 class="text-2xl font-bold mb-6">Question results</h2>

				<div class="mb-6">
					<p class="text-lg mb-2"><strong>Question:</strong> {question.question}</p>
					<p class="text-lg"><strong>Correct answer(s):</strong></p>
					<div class="grid grid-cols-2 gap-4 mt-2">
						{#each question.answers as answer, i}
							<div class="p-3 rounded-lg {answer.correct ? 'bg-green-100 border-2 border-green-500' : 'bg-gray-100'}">
								<span class="font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
								{answer.text}
								{#if answer.correct}
									<span class="ml-2 text-green-600">✓</span>
								{/if}
							</div>
						{/each}
					</div>
				</div>

				<h3 class="text-xl font-bold mb-4">Top scores</h3>
				<div class="space-y-2 mb-6">
					{#each leaderboard.slice(0, 5) as entry}
						<div class="flex items-center justify-between bg-gray-100 p-3 rounded">
							<div class="flex items-center gap-3">
								<span class="text-2xl font-bold text-purple-600">#{entry.rank}</span>
								<span class="font-semibold">{entry.playerName}</span>
							</div>
							<span class="text-xl font-bold">{entry.score}</span>
						</div>
					{/each}
				</div>

				<button
					onclick={nextQuestion}
					class="w-full bg-blue-600 text-white py-4 px-6 rounded-lg font-bold text-xl hover:bg-blue-700"
				>
					{game.currentQuestionIndex + 1 < game.config.questions.length ? 'Next question' : 'Show final results'}
				</button>
			</div>
		{/if}

		{#if game?.phase === 'leaderboard'}
			<div class="bg-white rounded-lg shadow-xl p-8">
				<h2 class="text-3xl font-bold mb-8 text-center">Final leaderboard</h2>

				<div class="space-y-3">
					{#each leaderboard as entry}
						<div class="flex items-center justify-between p-4 rounded-lg {entry.rank <= 3 ? 'bg-gradient-to-r from-yellow-200 to-yellow-100' : 'bg-gray-100'}">
							<div class="flex items-center gap-4">
								<span class="text-3xl font-bold {entry.rank === 1 ? 'text-yellow-500' : entry.rank === 2 ? 'text-gray-400' : entry.rank === 3 ? 'text-orange-400' : 'text-gray-600'}">
									#{entry.rank}
								</span>
								<span class="text-xl font-semibold">{entry.playerName}</span>
							</div>
							<span class="text-2xl font-bold text-purple-600">{entry.score}</span>
						</div>
					{/each}
				</div>

				<button
					onclick={endGame}
					class="mt-8 w-full bg-red-600 text-white py-4 px-6 rounded-lg font-bold text-xl hover:bg-red-700"
				>
					End game
				</button>
			</div>
		{/if}

		{#if game?.phase === 'finished'}
			<div class="bg-white rounded-lg shadow-xl p-8 text-center">
				<h2 class="text-3xl font-bold mb-4">Game finished!</h2>
				<p class="text-gray-600 mb-6">Thank you for playing!</p>
				<a href="/" class="inline-block bg-blue-600 text-white py-3 px-8 rounded-lg font-bold hover:bg-blue-700">
					Create new game
				</a>
			</div>
		{/if}
	</div>
</div>
