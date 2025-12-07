<script lang="ts">
  import { page } from "$app/stores";
  import ScrollArea from "$lib/components/ui/scroll-area/scroll-area.svelte";
  import { Toaster } from "$lib/components/ui/sonner/index.js";
  import { ANSWER_BUTTONS } from "$lib/constants";
  import type { GameState, LeaderboardEntry } from "$lib/types";
  import QRCode from "qrcode";
  import { io, type Socket } from "socket.io-client";
  import { onDestroy, onMount } from "svelte";
  import { toast } from "svelte-sonner";

  let socket: Socket;
  let game = $state<GameState | null>(null);
  let leaderboard = $state<LeaderboardEntry[]>([]);
  let qrCodeUrl = $state("");
  let playerCount = $derived(game ? Object.keys(game.players).length : 0);
  let answeredCount = $state(0);
  let editingPlayerId = $state<string | null>(null);
  let editingPlayerName = $state("");
  let readTimeRemaining = $state(0);
  let answerTimeRemaining = $state(0);
  let readInterval: NodeJS.Timeout | undefined;
  let answerInterval: NodeJS.Timeout | undefined;

  // Calculate answer counts for current question in answer-review phase
  let answerCounts = $derived.by(() => {
    if (!game || game.currentQuestionIndex < 0) return {};
    const counts: Record<number, number> = {};
    const qIndex = game.currentQuestionIndex;
    Object.values(game.players).forEach((p) => {
      const ans = p.answers[qIndex] || [];
      ans.forEach((i) => {
        counts[i] = (counts[i] || 0) + 1;
      });
    });
    return counts;
  });
  let maxCount = $derived(Math.max(...Object.values(answerCounts), 1));

  const gameId = $page.params.gameId;
  const joinUrl = typeof window !== "undefined" ? `${window.location.origin}/play/${gameId}` : "";

  onMount(async () => {
    // Generate QR code
    if (joinUrl) {
      qrCodeUrl = await QRCode.toDataURL(joinUrl, { width: 300 });
    }

    // Fetch initial game state
    const response = await fetch(`/api/games/${gameId}`);
    if (response.ok) {
      const data = await response.json();
      game = data.game;

      // If we're in leaderboard phase on refresh, populate the leaderboard
      if (game?.phase === "scoreboard" || game?.phase === "leaderboard") {
        console.log("Populating leaderboard on refresh, players:", game.players);
        if (game.players && Object.keys(game.players).length > 0) {
          leaderboard = Object.values(game.players)
            .map((player) => ({
              playerId: player.id,
              playerName: player.name,
              score: player.score,
              rank: 0, // Will be set below
            }))
            .sort((a, b) => b.score - a.score)
            .map((entry, index) => ({
              ...entry,
              rank: index + 1,
            }));
          console.log("Leaderboard populated:", leaderboard);
        } else {
          console.warn("No players found in game state");
        }
      }
    }

    // Connect to Socket.IO
    socket = io();
    socket.emit("host:join", gameId);

    socket.on("host:joined", () => {
      console.log("Joined as host");
    });

    socket.on("player:added", () => {
      // Refresh game state
      fetch(`/api/games/${gameId}`)
        .then((r) => r.json())
        .then((data) => (game = data.game));
    });

    socket.on("game:started", (updatedGame: GameState) => {
      game = updatedGame;
      startReadTimer();
    });

    socket.on("game:state-update", (updatedGame: GameState) => {
      const prevPhase = game?.phase;
      game = updatedGame;
      // Only start timers / reset counts on phase transitions
      if (game.phase === "question-reading") {
        if (prevPhase !== "question-reading") startReadTimer();
      } else if (game.phase === "question-answering") {
        if (prevPhase !== "question-answering") {
          // reset answered count only when entering the answering phase
          answeredCount = 0;
          startAnswerTimer();
        }
      } else {
        clearTimers();
      }
    });

    socket.on("game:scoreboard", ({ game: updatedGame, leaderboard: lb }) => {
      game = updatedGame;
      leaderboard = lb;
      clearTimers();
    });

    socket.on("game:ended", ({ leaderboard: lb }) => {
      leaderboard = lb;
      clearTimers();
    });

    socket.on("player:answered", ({ answeredCount: count }: { answeredCount: number }) => {
      answeredCount = count;
    });

    socket.on("player:renamed", ({ oldName, newName }: { oldName: string; newName: string }) => {
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
    socket.emit("host:start-game", gameId);
  }

  function startAnswering() {
    socket.emit("host:start-answering", gameId);
  }

  function showScoreboard() {
    socket.emit("host:show-scoreboard", gameId);
  }

  function nextQuestion() {
    socket.emit("host:next-question", gameId);
  }

  function endGame() {
    socket.emit("host:end-game", gameId);
  }

  function startEditingPlayer(playerId: string, currentName: string) {
    editingPlayerId = playerId;
    editingPlayerName = currentName;
  }

  function cancelEditing() {
    editingPlayerId = null;
    editingPlayerName = "";
  }

  function savePlayerName(playerId: string) {
    if (editingPlayerName.trim() && editingPlayerName.trim() !== game?.players[playerId]?.name) {
      socket.emit("host:rename-player", { playerId, newName: editingPlayerName.trim() });
    }
    cancelEditing();
  }

  function getYouTubeEmbedUrl(url: string): string {
    const videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/)?.[1];
    return videoId ? `https://www.youtube.com/embed/${videoId}` : "";
  }
</script>

<Toaster position="top-center" />

<div class="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 p-8">
  <div class="max-w-6xl mx-auto">
    <h1 class="text-4xl font-bold text-white mb-8 text-center">
      {game?.config.name || "Quiz Game"}
    </h1>

    {#if game?.phase === "lobby"}
      <div class="bg-white rounded-lg shadow-xl p-8 mb-8">
        <h2 class="text-2xl font-bold mb-4">Waiting for players</h2>

        <div class="flex gap-8 items-start">
          <div class="flex-1">
            <p class="font-semibold mb-2">Scan QR code to join:</p>
            {#if qrCodeUrl}
              <img
                src={qrCodeUrl}
                alt="QR Code"
                class="border-4 border-gray-200 rounded-lg mx-auto w-[300px] h-[300px]"
              />
            {/if}
            <p class="my-2 text-md text-center font-mono bg-gray-100 p-3 rounded break-all">
              {joinUrl}
            </p>
          </div>

          <div class="flex-1">
            <p class="font-semibold mb-2">Players ({playerCount}):</p>
            <ScrollArea class="space-y-2 h-[360px]">
              {#each Object.values(game.players) as player}
                <div class="bg-gray-100 p-3 rounded flex items-center justify-between mb-2">
                  <div class="flex items-center gap-3">
                    <span class="font-semibold">{player.name}</span>
                    {#if player.connected === false}
                      <span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded"
                        >Disconnected</span
                      >
                    {/if}
                  </div>

                  {#if editingPlayerId === player.id}
                    <input
                      type="text"
                      bind:value={editingPlayerName}
                      class="flex-1 px-2 py-1 border border-gray-300 rounded mr-2"
                      onkeydown={(e) => {
                        if (e.key === "Enter") savePlayerName(player.id);
                        if (e.key === "Escape") cancelEditing();
                      }}
                    />
                    <button
                      onclick={() => savePlayerName(player.id)}
                      class="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 mr-1"
                    >
                      ✅
                    </button>
                    <button
                      onclick={cancelEditing}
                      class="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                    >
                      ❌
                    </button>
                  {:else}
                    <div class="flex items-center gap-2">
                      <span class="mr-2"></span>
                      <button
                        onclick={() => startEditingPlayer(player.id, player.name)}
                        class="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                        disabled={player.connected === false}
                        title={player.connected === false
                          ? "Player is disconnected"
                          : "Rename player"}
                      >
                        Rename
                      </button>
                    </div>
                  {/if}
                </div>
              {/each}
            </ScrollArea>
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

    <!-- Question Reading Phase -->
    {#if game?.phase === "question-reading"}
      {@const question = game.config.questions[game.currentQuestionIndex]}
      <div class="bg-white rounded-lg shadow-xl p-8 mb-8">
        <div class="mb-4 flex justify-between items-center">
          <span class="text-sm text-gray-600"
            >Question {game.currentQuestionIndex + 1} of {game.config.questions.length}</span
          >
          {#if game.config.settings.showCountdown}
            <span class="text-lg font-bold text-purple-600">{readTimeRemaining}s</span>
          {/if}
        </div>

        <h2
          class="text-3xl font-bold my-8 relative text-center z-10 border p-12 rounded-lg bg-white"
        >
          {question.question}
        </h2>

        {#if question.mediaType === "image" && question.mediaUrl}
          <img
            src={question.mediaUrl}
            alt="Question media"
            class="max-w-md mx-auto rounded-lg mb-6"
          />
        {/if}

        {#if question.mediaType === "video" && question.mediaUrl}
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

        <div class="text-center py-8">
          <button
            onclick={startAnswering}
            class="w-full bg-blue-600 text-white py-4 px-6 rounded-lg font-bold text-xl hover:bg-blue-700"
          >
            Start answering
          </button>
        </div>
      </div>
    {/if}

    <!-- Question Answering Phase -->
    {#if game?.phase === "question-answering"}
      {@const question = game.config.questions[game.currentQuestionIndex]}
      <div class="bg-white rounded-lg shadow-xl p-8 mb-8">
        <div class="mb-4 flex justify-between items-center">
          <span class="text-sm text-gray-600"
            >Question {game.currentQuestionIndex + 1} of {game.config.questions.length}</span
          >
          <div class="flex gap-4 items-center">
            <span class="text-sm font-semibold text-blue-600">
              {answeredCount} / {playerCount} answered
            </span>
          </div>
        </div>

        <h2
          class="text-3xl font-bold my-8 relative text-center z-10 border p-12 rounded-lg bg-white"
        >
          {question.question}
        </h2>

        {#if question.mediaType === "image" && question.mediaUrl}
          <img
            src={question.mediaUrl}
            alt="Question media"
            class="max-w-md mx-auto rounded-lg mb-6"
          />
        {/if}

        <div class="grid grid-cols-2 gap-4 mb-6">
          {#each question.answers as answer, i}
            {@const color = ANSWER_BUTTONS[i % ANSWER_BUTTONS.length]}
            <div
              class="flex align-center justify-center p-4 rounded-lg h-[20vh] {color.bg} {color.text}"
            >
              <div class="flex items-center gap-3">
                <span class="text-3xl">{color.symbol}</span>
                <div class="font-bold text-3xl">
                  {String.fromCharCode(65 + i)}. {answer.text}
                </div>
              </div>
            </div>
          {/each}
        </div>

        <div class="text-center">
          <button
            onclick={() => socket.emit("host:reveal-answers", gameId)}
            class="bg-orange-600 text-white py-3 px-6 rounded-lg font-bold hover:bg-orange-700"
          >
            Reveal answers

            {#if game.config.settings.showCountdown && answerTimeRemaining > 0}
              ({answerTimeRemaining}s)
            {/if}
          </button>
        </div>
      </div>
    {/if}

    <!-- Answer Review Phase -->
    {#if game?.phase === "answer-review"}
      {@const question = game.config.questions[game.currentQuestionIndex]}
      <div class="bg-white rounded-lg shadow-xl p-8 mb-8">
        <div class="mb-4">
          <span class="text-sm text-gray-600"
            >Question {game.currentQuestionIndex + 1} of {game.config.questions.length}</span
          >
        </div>

        <h2 class="text-3xl font-bold my-8 text-center border p-12 rounded-lg bg-white">
          {question.question}
        </h2>

        <div class="grid grid-cols-2 gap-4 mb-6">
          {#each question.answers as answer, i}
            {@const color = ANSWER_BUTTONS[i % ANSWER_BUTTONS.length]}
            <div
              class="p-4 rounded-lg border-2 {answer.correct
                ? `${color.bg} ${color.text} border-green-500 ring-4 ring-green-200`
                : `${color.bg} ${color.text} border-gray-300 opacity-30`}"
            >
              <div class="flex items-center gap-3">
                <span class="text-3xl">{color.symbol}</span>
                <div class="font-bold text-lg">
                  {String.fromCharCode(65 + i)}. {answer.text}
                </div>
                {#if answer.correct}
                  <span class="text-2xl ml-auto">✅</span>
                {/if}
              </div>
            </div>
          {/each}
        </div>

        <!-- Answer distribution chart -->
        <div class="mb-6 p-4 bg-gray-50 rounded">
          <h3 class="text-lg font-bold mb-4 text-center">Answer Distribution</h3>
          <div class="flex items-end gap-4 h-40 justify-center">
            {#each question.answers as _, i}
              {@const value = answerCounts[i] || 0}
              <div class="flex-1 max-w-[80px] text-center">
                <div
                  class="mx-auto bg-purple-600 rounded-t"
                  style="height: {Math.round(
                    (value / maxCount) * 100
                  )}%; width: 100%; min-height: 4px;"
                ></div>
                <div class="mt-2 text-sm font-bold">{String.fromCharCode(65 + i)}</div>
                <div class="text-xs text-gray-600">{value} votes</div>
              </div>
            {/each}
          </div>
        </div>

        <button
          onclick={showScoreboard}
          class="w-full bg-blue-600 text-white py-4 px-6 rounded-lg font-bold text-xl hover:bg-blue-700"
        >
          Show scoreboard
        </button>
      </div>
    {/if}

    {#if game?.phase === "scoreboard"}
      <div class="bg-white rounded-lg shadow-xl p-8 mb-8">
        <h3 class="text-xl font-bold mb-4">Leaderboard</h3>
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
          {game.currentQuestionIndex + 1 < game.config.questions.length
            ? "Next question"
            : "Show final results"}
        </button>
      </div>
    {/if}

    {#if game?.phase === "leaderboard"}
      <div class="bg-white rounded-lg shadow-xl p-8">
        <h2 class="text-3xl font-bold mb-8 text-center">Leaderboard</h2>

        <div class="space-y-3">
          {#each leaderboard as entry}
            <div
              class="flex items-center justify-between p-4 rounded-lg {entry.rank <= 3
                ? 'bg-gradient-to-r from-yellow-200 to-yellow-100'
                : 'bg-gray-100'}"
            >
              <div class="flex items-center gap-4">
                <span
                  class="text-3xl font-bold {entry.rank === 1
                    ? 'text-yellow-500'
                    : entry.rank === 2
                      ? 'text-gray-400'
                      : entry.rank === 3
                        ? 'text-orange-400'
                        : 'text-gray-600'}"
                >
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

    {#if game?.phase === "finished"}
      <div class="bg-white rounded-lg shadow-xl p-8 text-center">
        <h2 class="text-3xl font-bold mb-4">Game finished!</h2>
        <p class="text-gray-600 mb-6">Thank you for playing!</p>
        <a
          href="/"
          class="inline-block bg-blue-600 text-white py-3 px-8 rounded-lg font-bold hover:bg-blue-700"
        >
          Create new game
        </a>
      </div>
    {/if}
  </div>
</div>
