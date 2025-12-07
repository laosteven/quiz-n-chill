<script lang="ts">
  import { page } from "$app/stores";
  import type { GameState, Player } from "$lib/types";
  import { io, type Socket } from "socket.io-client";
  import { onDestroy, onMount } from "svelte";

  let socket: Socket;
  let game = $state<GameState | null>(null);
  let player = $state<Player | null>(null);
  let playerName = $state("");
  let joined = $state(false);
  let selectedAnswers = $state<number[]>([]);
  let hasSubmitted = $state(false);
  let editingName = $state(false);
  let newPlayerName = $state("");
  let readTimeRemaining = $state(0);
  let answerTimeRemaining = $state(0);
  let readInterval: NodeJS.Timeout | undefined;
  let answerInterval: NodeJS.Timeout | undefined;

  const gameId = $page.params.gameId;

  // Kahoot-style colors for answer buttons
  const answerColors = [
    { bg: "bg-red-500", hover: "hover:bg-red-600", text: "text-white", symbol: "▲" },
    { bg: "bg-blue-500", hover: "hover:bg-blue-600", text: "text-white", symbol: "◆" },
    { bg: "bg-yellow-500", hover: "hover:bg-yellow-600", text: "text-white", symbol: "●" },
    { bg: "bg-green-500", hover: "hover:bg-green-600", text: "text-white", symbol: "■" },
  ];

  onMount(() => {
    console.log("🔌 Connecting to Socket.IO...");
    socket = io({
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      console.log("✅ Connected to Socket.IO server:", socket.id);
    });

    socket.on("connect_error", (error) => {
      console.error("❌ Socket.IO connection error:", error);
    });

    socket.on("player:joined", ({ playerId, player: p }: { playerId: string; player: Player }) => {
      console.log("✅ Player joined successfully:", playerId);
      player = p;
      joined = true;
      localStorage.setItem(`player:${gameId}`, JSON.stringify({ playerId, playerName: p.name }));
    });

    socket.on("game:started", (updatedGame: GameState) => {
      game = updatedGame;
      startReadTimer();
    });

    socket.on("game:state-update", (updatedGame: GameState) => {
      game = updatedGame;
      if (player && updatedGame.players[player.id]) {
        player = updatedGame.players[player.id];
      }
      if (game.phase === "question-reading") {
        hasSubmitted = false;
        selectedAnswers = [];
        startReadTimer();
      } else if (game.phase === "question-answering") {
        hasSubmitted = false;
        selectedAnswers = [];
        startAnswerTimer();
      } else {
        clearTimers();
      }
    });

    socket.on("game:scoreboard", ({ game: updatedGame }) => {
      game = updatedGame;
      if (player && updatedGame.players[player.id]) {
        player = updatedGame.players[player.id];
      }
      clearTimers();
    });

    socket.on("answer:submitted", () => {
      hasSubmitted = true;
    });

    socket.on(
      "name:updated-by-host",
      ({ oldName, newName, message }: { oldName: string; newName: string; message: string }) => {
        console.log("Host renamed me:", message);
        if (player) {
          player.name = newName;
          playerName = newName;
          localStorage.setItem(
            `player:${gameId}`,
            JSON.stringify({ playerId: player.id, playerName: newName })
          );
        }
        alert(message); // Simple alert for now, could use a toast
      }
    );

    socket.on("error", (error: { message: string }) => {
      console.error("❌ Server error:", error);
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

    answerInterval = setInterval(() => {
      answerTimeRemaining--;
      if (answerTimeRemaining <= 0) {
        clearInterval(answerInterval);
      }
    }, 1000);
  }

  function joinGame() {
    if (playerName.trim()) {
      console.log(`🎮 Attempting to join game "${gameId}" as "${playerName.trim()}"`);
      console.log("Socket connected:", socket?.connected);
      socket.emit("player:join", { gameId, playerName: playerName.trim() });
    }
  }

  function toggleAnswer(index: number) {
    if (hasSubmitted || !game || game.phase !== "question-answering") return;

    const question = game.config.questions[game.currentQuestionIndex];

    if (question.answerType === "single") {
      selectedAnswers = [index];
    } else {
      if (selectedAnswers.includes(index)) {
        selectedAnswers = selectedAnswers.filter((i) => i !== index);
      } else {
        selectedAnswers = [...selectedAnswers, index];
      }
    }
  }

  function submitAnswer() {
    if (selectedAnswers.length > 0) {
      socket.emit("player:submit-answer", { answerIndices: selectedAnswers });
    }
  }

  function startRenaming() {
    if (player) {
      newPlayerName = player.name;
      editingName = true;
    }
  }

  function cancelRenaming() {
    editingName = false;
    newPlayerName = "";
  }

  function saveNewName() {
    if (newPlayerName.trim() && newPlayerName.trim() !== player?.name) {
      socket.emit("player:rename", { newName: newPlayerName.trim() });
    }
    editingName = false;
  }

  let playerScore = $derived(game && player ? game.players[player.id]?.score || 0 : 0);
  let playerRank = $derived.by(() => {
    if (!game || !player) return 0;
    const scores = Object.values(game.players)
      .map((p) => p.score)
      .sort((a, b) => b - a);
    return scores.indexOf(playerScore) + 1;
  });
</script>

<div class="min-h-screen bg-gradient-to-br from-pink-500 to-purple-600 p-4">
  <div class="max-w-2xl mx-auto">
    {#if !joined}
      <div class="bg-white rounded-lg shadow-xl p-8 mt-20">
        <h1 class="text-3xl font-bold mb-6 text-center">Join quiz</h1>
        <p class="text-gray-600 mb-4 text-center">
          Game code: <span class="font-mono font-bold text-purple-600">{gameId}</span>
        </p>

        <div class="space-y-4">
          <input
            type="text"
            bind:value={playerName}
            placeholder="Enter your name"
            class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-600 focus:outline-none text-lg"
            onkeydown={(e) => e.key === "Enter" && joinGame()}
          />
          <button
            onclick={joinGame}
            disabled={!playerName.trim()}
            class="w-full bg-purple-600 text-white py-3 px-6 rounded-lg font-bold text-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Join Game
          </button>

          <p class="text-muted-foreground mt-4 text-sm text-center">
            Make sure to use a unique name to keep your score!
          </p>
        </div>
      </div>
    {:else if game?.phase === "lobby"}
      <div class="bg-white rounded-lg shadow-xl p-8 mt-20 text-center">
        <h2 class="text-2xl font-bold mb-4">Welcome, {player?.name}!</h2>
        <p class="text-gray-600 mb-4">🎉 The game will start soon!</p>
        <p class="text-sm text-gray-500 mb-6">Waiting for the host to begin...</p>
        <div class="animate-pulse text-8xl mb-6">⏳</div>

        {#if !editingName}
          <button
            onclick={startRenaming}
            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            Change name
          </button>
        {:else}
          <div class="flex gap-2 justify-center items-center">
            <input
              type="text"
              bind:value={newPlayerName}
              class="px-3 py-2 border border-gray-300 rounded-lg"
              onkeydown={(e) => {
                if (e.key === "Enter") saveNewName();
                if (e.key === "Escape") cancelRenaming();
              }}
              autofocus
            />
            <button
              onclick={saveNewName}
              class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Save
            </button>
            <button
              onclick={cancelRenaming}
              class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        {/if}
      </div>
    {:else if game?.phase === "question-reading"}
      {@const question = game.config.questions[game.currentQuestionIndex]}
      <div class="bg-white rounded-lg shadow-xl p-8">
        <div class="mb-4 text-center">
          <span class="text-sm text-gray-600"
            >Question {game.currentQuestionIndex + 1} of {game.config.questions.length}</span
          >
          <div class="mt-2">
            <span class="text-sm font-semibold text-purple-600">Your Score: {playerScore}</span>
          </div>
          {#if game.config.settings.showCountdown && readTimeRemaining > 0}
            <div class="mt-2">
              <span class="text-2xl font-bold text-orange-600">{readTimeRemaining}s</span>
            </div>
          {/if}
        </div>

        <h2 class="text-2xl font-bold mb-6 text-center">{question.question}</h2>

        {#if question.mediaType === "image" && question.mediaUrl}
          <img
            src={question.mediaUrl}
            alt="Question media"
            class="max-w-full mx-auto rounded-lg mb-6"
          />
        {/if}

        <div class="text-center py-8">
          <p class="text-lg text-gray-600">Get ready to answer...</p>
          <div class="text-4xl animate-pulse mt-4">📖</div>
        </div>
      </div>
    {:else if game?.phase === "question-answering"}
      {@const question = game.config.questions[game.currentQuestionIndex]}
      <div class="bg-white rounded-lg shadow-xl p-8">
        <div class="mb-4 text-center">
          <span class="text-sm text-gray-600"
            >Question {game.currentQuestionIndex + 1} of {game.config.questions.length}</span
          >
          <div class="mt-2 flex justify-center gap-4 items-center">
            <span class="text-sm font-semibold text-purple-600">Your Score: {playerScore}</span>
            {#if game.config.settings.showCountdown && answerTimeRemaining > 0}
              <span class="text-2xl font-bold text-red-600">{answerTimeRemaining}s</span>
            {/if}
          </div>
        </div>

        <h2 class="text-xl font-bold mb-4 text-center">{question.question}</h2>

        {#if !hasSubmitted}
          <p class="text-sm text-gray-600 mb-4 text-center">
            {question.answerType === "multiple"
              ? "Select all correct answers"
              : "Select one answer"}
          </p>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {#each question.answers as answer, i}
              {@const color = answerColors[i % answerColors.length]}
              <button
                onclick={() => toggleAnswer(i)}
                class="p-6 rounded-xl font-bold text-lg transition-all transform hover:scale-105 active:scale-95 {selectedAnswers.includes(
                  i
                )
                  ? `${color.bg} ${color.text} ring-4 ring-offset-2 ring-offset-white`
                  : `${color.bg} ${color.text} opacity-80 hover:opacity-100`}"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <span class="text-3xl">{color.symbol}</span>
                    <span class="text-left">{answer.text}</span>
                  </div>
                  {#if selectedAnswers.includes(i)}
                    <span class="text-2xl">✓</span>
                  {/if}
                </div>
              </button>
            {/each}
          </div>

          <button
            onclick={submitAnswer}
            disabled={selectedAnswers.length === 0}
            class="w-full bg-gradient-to-r from-green-600 to-green-500 text-white py-4 px-6 rounded-lg font-bold text-lg hover:from-green-700 hover:to-green-600 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed transition-all transform hover:scale-105 active:scale-95"
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
    {:else if game?.phase === "scoreboard"}
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
    {:else if game?.phase === "leaderboard"}
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
    {:else if game?.phase === "finished"}
      <div class="bg-white rounded-lg shadow-xl p-8 text-center">
        <h2 class="text-2xl font-bold mb-4">Game over!</h2>
        <p class="text-gray-600">Thanks for playing!</p>
      </div>
    {/if}
  </div>
</div>
