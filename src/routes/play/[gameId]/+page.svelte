<script lang="ts">
  import { page } from "$app/stores";
  import GameMenu from "$lib/components/game/GameMenu.svelte";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import TopProgress from "$lib/components/ui/top-progress.svelte";
  import { ANSWER_BUTTONS } from "$lib/constants";
  import type { GameState, Player } from "$lib/types";
  import Info from "@lucide/svelte/icons/info";
  import { Bar, BarChart, type ChartContextValue } from "layerchart";
  import { io, type Socket } from "socket.io-client";
  import { onDestroy, onMount } from "svelte";
  import { cubicInOut } from "svelte/easing";

  let socket: Socket;
  let game = $state<GameState | null>(null);
  let player = $state<Player | null>(null);
  let playerName = $state("");
  let joined = $state(false);
  let selectedAnswers = $state<number[]>([]);
  let hasSubmitted = $state(false);
  let editingName = $state(false);
  let newPlayerName = $state("");

  // Track player's actual selections per question locally
  let playerSelections = $state<Record<number, number[]>>({});
  let readTimeRemaining = $state(0);
  let answerTimeRemaining = $state(0);
  let readInterval: NodeJS.Timeout | undefined;
  let answerInterval: NodeJS.Timeout | undefined;
  let revealedAnswers = $state<number[]>([]);
  let context = $state<ChartContextValue>();

  // Calculate answer counts for current question
  let counts = $derived.by(() => {
    if (!game || game.currentQuestionIndex < 0) return {};
    const result: Record<number, number> = {};
    const qIndex = game.currentQuestionIndex;
    Object.values(game.players).forEach((p) => {
      const ans = p.answers[qIndex] || [];
      ans.forEach((i) => {
        result[i] = (result[i] || 0) + 1;
      });
    });
    return result;
  });

  // Derived state to get the current question's player selections
  let currentQuestionSelections = $derived.by(() => {
    if (!game || game.currentQuestionIndex < 0) return [];
    return playerSelections[game.currentQuestionIndex] || [];
  });

  let chartData = $derived.by(() => {
    const q = game?.config.questions?.[game.currentQuestionIndex];
    if (!q) return [];
    const arr = [];
    for (let i = 0; i < q.answers.length; i++) {
      const letter = String.fromCharCode(65 + i);
      const count = counts[i] || 0;
      const color =
        "var(--color-" + ANSWER_BUTTONS[i % ANSWER_BUTTONS.length].bg.replace("bg-", "") + ")";
      const isCorrectAnswer = revealedAnswers.includes(i) || !!q.answers[i]?.correct;
      arr.push({ letter, count, color, isCorrectAnswer });
    }
    return arr;
  });

  let lastScoreGain = $state<number | null>(null);
  let prevScore = $state<number | null>(null);

  const gameId = $page.params.gameId;

  // Answer button styles are imported from ANSWER_BUTTONS

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
      const prevPhase = game?.phase;
      // capture previous player score before updating state
      const prevPlayerScore = player ? player.score || 0 : 0;
      game = updatedGame;
      if (player && updatedGame.players[player.id]) {
        player = updatedGame.players[player.id];
      } else if (!joined && socket && socket.id) {
        // fallback: if the updated game already contains our socket id, assume we joined
        const maybe = updatedGame.players?.[socket.id];
        if (maybe) {
          player = maybe;
          joined = true;
          localStorage.setItem(
            `player:${gameId}`,
            JSON.stringify({ playerId: player.id, playerName: player.name })
          );
        }
      }

      // Handle phase transitions
      const qIndex = game.currentQuestionIndex;
      const serverPlayer = player && game.players ? game.players[player.id] : undefined;

      // Load local selections from localStorage
      const localSelectionsKey = `selections:${gameId}:${player?.id || "temp"}`;
      const storedSelections = localStorage.getItem(localSelectionsKey);
      if (storedSelections) {
        try {
          playerSelections = JSON.parse(storedSelections);
        } catch (e) {
          console.error("Failed to parse stored selections:", e);
          playerSelections = {};
        }
      }

      if (game.phase === "question-reading") {
        if (prevPhase !== "question-reading") {
          hasSubmitted = false;
          selectedAnswers = [];
          startReadTimer();
        }
      } else if (game.phase === "question-answering") {
        // Always check if server has an answer for this player (even on refresh)
        if (serverPlayer?.answers?.[qIndex] && serverPlayer.answers[qIndex].length > 0) {
          hasSubmitted = true;
          selectedAnswers = serverPlayer.answers[qIndex].slice();
          // Also store this in local selections
          playerSelections[qIndex] = serverPlayer.answers[qIndex].slice();
          localStorage.setItem(localSelectionsKey, JSON.stringify(playerSelections));
        } else if (prevPhase !== "question-answering") {
          hasSubmitted = false;
          selectedAnswers = playerSelections[qIndex] || [];
        }
        if (prevPhase !== "question-answering") startAnswerTimer();
      } else if (game.phase === "answer-review") {
        // Lock submission when in review phase and ensure we use local selections
        hasSubmitted = true;
        selectedAnswers = playerSelections[qIndex] || [];
        // reset lastScoreGain while in review
        lastScoreGain = null;
      } else {
        clearTimers();
      }

      // If the server moved to scoreboard, compute score gain for this player
      if (prevPhase !== "scoreboard" && game.phase === "scoreboard") {
        const newScore = player && game.players ? game.players[player.id]?.score || 0 : 0;
        lastScoreGain = newScore - prevPlayerScore;
        prevScore = prevPlayerScore;
      }
    });

    socket.on("game:scoreboard", ({ game: updatedGame }) => {
      // capture previous player score before updating state
      const prevPlayerScore = player ? player.score || 0 : 0;
      game = updatedGame;
      if (player && updatedGame.players[player.id]) {
        player = updatedGame.players[player.id];
      }

      // compute score gain for this player
      const newScore =
        player && updatedGame.players ? updatedGame.players[player.id]?.score || 0 : 0;
      lastScoreGain = newScore - prevPlayerScore;
      prevScore = prevPlayerScore;

      clearTimers();
    });

    // Listen for host revealing correct answers explicitly
    socket.on("answer:revealed", ({ answers }: { answers: number[] }) => {
      // answers is an array of indices marked correct by host
      revealedAnswers = answers || [];
    });

    socket.on("answer:submitted", () => {
      hasSubmitted = true;
    });

    // Also mark submitted when the server broadcasts player:answered for this player
    socket.on("player:answered", ({ playerId }: { playerId: string }) => {
      if (player && player.id === playerId) {
        hasSubmitted = true;
      }
    });

    socket.on("player:join-failed", ({ message }: { message: string }) => {
      alert(`Unable to join: ${message}`);
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

  function vibrate() {
    if (typeof navigator !== "undefined" && (navigator as any).vibrate) {
      try {
        (navigator as any).vibrate(100);
      } catch (e) {}
    }
  }

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

    vibrate();
  }

  function joinGame() {
    if (playerName.trim()) {
      console.log(`🎮 Attempting to join game "${gameId}" as "${playerName.trim()}"`);
      if (socket && socket.connected) {
        socket.emit("player:join", { gameId, playerName: playerName.trim() });
      } else {
        console.log("Socket not connected yet, waiting for connection...");
        const onConnect = () => {
          socket.emit("player:join", { gameId, playerName: playerName.trim() });
          socket.off("connect", onConnect);
        };
        socket.on("connect", onConnect);
        // Fallback timeout
        setTimeout(() => {
          if (!socket.connected)
            alert("Unable to connect to game server. Try refreshing the page.");
        }, 3000);
      }
    }
  }

  function toggleAnswer(index: number) {
    if (hasSubmitted || !game || game.phase !== "question-answering") return;

    const question = game.config.questions[game.currentQuestionIndex];
    const qIndex = game.currentQuestionIndex;

    if (question.answerType === "single") {
      selectedAnswers = [index];
    } else {
      if (selectedAnswers.includes(index)) {
        selectedAnswers = selectedAnswers.filter((i) => i !== index);
      } else {
        selectedAnswers = [...selectedAnswers, index];
      }
    }

    // Save to local selections
    playerSelections[qIndex] = selectedAnswers.slice();
    const localSelectionsKey = `selections:${gameId}:${player?.id || "temp"}`;
    localStorage.setItem(localSelectionsKey, JSON.stringify(playerSelections));
  }

  function submitAnswer() {
    if (selectedAnswers.length > 0) {
      // Immediately flip to submitted state so UI shows waiting message
      hasSubmitted = true;
      socket.emit("player:submit-answer", { answerIndices: selectedAnswers });

      vibrate();
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
  <GameMenu />

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
            Join game
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
      <TopProgress
        total={question.readTime}
        remaining={readTimeRemaining}
        show={game?.config.settings.showCountdown && readTimeRemaining > 0}
        colorClass="bg-purple-600"
      />
      <div class="bg-white rounded-lg shadow-xl p-8 mt-20">
        <div class="mb-4 text-center">
          <span class="text-sm text-gray-600"
            >Question {game.currentQuestionIndex + 1} of {game.config.questions.length}</span
          >
          <div class="mt-2">
            <span class="text-sm font-semibold text-purple-600">Your score: {playerScore}</span>
          </div>
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
      <TopProgress
        total={question.timeLimit}
        remaining={answerTimeRemaining}
        show={game?.config.settings.showCountdown && answerTimeRemaining > 0 && !hasSubmitted}
        colorClass="bg-green-400"
      />
      <div class="bg-white rounded-lg shadow-xl p-8 mt-20">
        <div class="mb-4 text-center">
          <span class="text-sm text-gray-600"
            >Question {game.currentQuestionIndex + 1} of {game.config.questions.length}</span
          >
          <div class="mt-2 flex justify-center gap-4 items-center">
            <span class="text-sm font-semibold text-purple-600">Your score: {playerScore}</span>
          </div>
        </div>

        <h2 class="text-xl font-bold mb-4 text-center">{question.question}</h2>

        {#if !hasSubmitted}
          {#if question.answerType === "multiple"}
            <p
              class="flex items-center my-6 p-4 gap-2 justify-center bg-blue-300/30 text-sm text-center border rounded text-blue-700 font-medium"
            >
              <Info size={16} /> Multiple answers allowed.
            </p>
          {/if}

          <div class="grid grid-cols-2 gap-4 mb-6">
            {#each question.answers as answer, i}
              {@const color = ANSWER_BUTTONS[i % ANSWER_BUTTONS.length]}
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
                    <span class="text-2xl">✔️</span>
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
            Submit answer

            {#if game.config.settings.showCountdown && answerTimeRemaining > 0}
              ({answerTimeRemaining}s)
            {/if}
          </button>
        {:else}
          <div class="text-center py-12">
            <div class="text-6xl mb-4">✅</div>
            <p class="text-xl font-bold text-green-600">Answer submitted!</p>
            <p class="text-gray-600 mt-2">Waiting for other players...</p>
          </div>
        {/if}
      </div>
    {:else if game?.phase === "answer-review"}
      {@const question = game.config.questions[game.currentQuestionIndex]}
      <div class="bg-white rounded-lg shadow-xl p-8 mt-20">
        <div class="mb-4 text-center">
          <span class="text-sm text-gray-600"
            >Question {game.currentQuestionIndex + 1} of {game.config.questions.length}</span
          >
          <div class="mt-2">
            <span class="text-sm font-semibold text-purple-600">Your score: {playerScore}</span>
          </div>
        </div>

        <h2 class="text-2xl font-bold mb-6 text-center">{question.question}</h2>

        <!-- Correct answers highlighted -->
        <div class="grid grid-cols-2 gap-4">
          {#each question.answers as answer, i}
            {@const color = ANSWER_BUTTONS[i % ANSWER_BUTTONS.length]}
            {@const wasSelected = currentQuestionSelections.includes(i)}
            {@const isCorrectAnswer = revealedAnswers.length
              ? revealedAnswers.includes(i)
              : answer.correct}
            {@const isMultipleChoice = question.answerType === "multiple"}
            {@const isMissedCorrect = isCorrectAnswer && !wasSelected && isMultipleChoice}

            <div
              class="p-4 rounded-lg border-2 {isCorrectAnswer
                ? `${color.bg} ${color.text} border-green-500 ring-4 ring-green-200`
                : wasSelected && !isCorrectAnswer
                  ? `${color.bg} ${color.text} border-red-500 ring-4 ring-red-200`
                  : isMissedCorrect
                    ? `${color.bg} ${color.text} border-orange-500 ring-4 ring-orange-200`
                    : `${color.bg} ${color.text} border-gray-300 opacity-60`}"
            >
              <div class="flex items-center gap-3">
                <span class="text-3xl">{color.symbol}</span>
                <div class="text-left font-bold flex-1">
                  {String.fromCharCode(65 + i)}. {answer.text}
                </div>
                {#if isCorrectAnswer}
                  {#if wasSelected}
                    <span class="text-2xl text-green-600">✅</span>
                  {:else if isMultipleChoice}
                    <span class="text-2xl text-orange-600">⚠️</span>
                  {:else}
                    <span class="text-2xl text-green-600">✅</span>
                  {/if}
                {:else if wasSelected}
                  <span class="text-2xl text-red-600">❌</span>
                {/if}
              </div>
            </div>
          {/each}
        </div>

        <div class="text-center mt-6 py-4">
          <p class="text-gray-600">Waiting for host to continue...</p>
        </div>
      </div>
    {:else if game?.phase === "distribution"}
      {@const question = game.config.questions[game.currentQuestionIndex]}
      <div class="bg-white rounded-lg shadow-xl p-8 mt-20">
        <div class="mb-4 text-center">
          <span class="text-sm text-gray-600"
            >Question {game.currentQuestionIndex + 1} of {game.config.questions.length}</span
          >
          <div class="mt-2">
            <span class="text-sm font-semibold text-purple-600">Your score: {playerScore}</span>
          </div>
        </div>

        <!-- Correct answers highlighted -->
        <div class="grid grid-cols-2 gap-4">
          {#each question.answers as answer, i}
            {@const color = ANSWER_BUTTONS[i % ANSWER_BUTTONS.length]}
            {@const wasSelected = currentQuestionSelections.includes(i)}
            {@const isCorrectAnswer = revealedAnswers.length
              ? revealedAnswers.includes(i)
              : answer.correct}
            {@const isMultipleChoice = question.answerType === "multiple"}
            {@const isMissedCorrect = isCorrectAnswer && !wasSelected && isMultipleChoice}

            <div
              class="p-4 rounded-lg border-2 {isCorrectAnswer
                ? `${color.bg} ${color.text} border-green-500 ring-4 ring-green-200`
                : wasSelected && !isCorrectAnswer
                  ? `${color.bg} ${color.text} border-red-500 ring-4 ring-red-200`
                  : isMissedCorrect
                    ? `${color.bg} ${color.text} border-orange-500 ring-4 ring-orange-200`
                    : `${color.bg} ${color.text} border-gray-300 opacity-60`}"
            >
              <div class="flex items-center gap-3">
                <span class="text-3xl">{color.symbol}</span>
                <div class="text-left font-bold flex-1">
                  {String.fromCharCode(65 + i)}. {answer.text}
                </div>
                {#if isCorrectAnswer}
                  {#if wasSelected}
                    <span class="text-2xl text-green-600">✅</span>
                  {:else if isMultipleChoice}
                    <span class="text-2xl text-orange-600">⚠️</span>
                  {:else}
                    <span class="text-2xl text-green-600">✅</span>
                  {/if}
                {:else if wasSelected}
                  <span class="text-2xl text-red-600">❌</span>
                {/if}
              </div>
            </div>
          {/each}
        </div>

        <h2 class="text-2xl font-bold mb-6 text-center">Distribution: {question.question}</h2>

        <Chart.Container config={{}} class="mt-16 mb-4 h-34 w-full">
          <BarChart
            bind:context
            data={chartData}
            x="letter"
            y="count"
            c="color"
            tooltip={false}
            labels={{ offset: 12 }}
            yBaseline={0}
            axis={true}
            props={{
              bars: {
                stroke: "none",
                rounded: "all",
                radius: 4,
                initialY: context?.height,
                initialHeight: 0,
                motion: {
                  height: { type: "tween", duration: 500, easing: cubicInOut },
                  y: { type: "tween", duration: 500, easing: cubicInOut },
                },
                fillOpacity: 0.9,
              },
              highlight: { area: { fill: "none" } },
            }}
          >
            {#snippet marks({ getBarsProps, visibleSeries })}
              {@const baseBarProps = getBarsProps(visibleSeries[0], 0)}
              {#each chartData as data, i (i)}
                {@const wasSelected = currentQuestionSelections.includes(i)}
                {@const isCorrectAnswer = revealedAnswers.length
                  ? revealedAnswers.includes(i)
                  : question.answers[i].correct}
                {#if wasSelected && isCorrectAnswer}
                  <Bar {...baseBarProps} fill={data.color} {data} motion="tween" />
                {:else}
                  <Bar
                    {...baseBarProps}
                    fill={data.color}
                    fillOpacity={0.2}
                    {data}
                    motion="tween"
                  />
                {/if}
              {/each}
            {/snippet}
          </BarChart>
        </Chart.Container>

        <div class="text-center py-8">
          <p class="text-gray-600">Waiting for host to continue...</p>
        </div>
      </div>
    {:else if game?.phase === "scoreboard"}
      <div class="bg-white rounded-lg shadow-xl p-8 mt-20">
        <h2 class="text-2xl font-bold mb-6 text-center">Results</h2>

        <div class="text-center">
          <div class="text-5xl font-bold text-purple-600 mb-2">{playerScore}</div>
          <p class="text-gray-600">Your score</p>
          {#if lastScoreGain !== null && prevScore !== null}
            <div class="text-green-600 font-bold mt-2">
              {prevScore} + {lastScoreGain} = {playerScore}
            </div>
          {:else if lastScoreGain !== null}
            <div class="text-green-600 font-bold mt-2">+{lastScoreGain} points</div>
          {/if}
          <p class="text-lg font-bold my-8 border border-gray-200 p-3 rounded">
            Rank: #{playerRank}
          </p>
        </div>

        <div class="text-center">
          <p class="text-gray-600">Get ready for the next question...</p>
        </div>
      </div>
    {:else if game?.phase === "leaderboard"}
      <div class="bg-white rounded-lg shadow-xl p-8 mt-20">
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
      <div class="bg-white rounded-lg shadow-xl p-8 text-center mt-20">
        <h2 class="text-2xl font-bold mb-4">Game over!</h2>
        <p class="text-gray-600">Thanks for playing!</p>
      </div>
    {/if}
  </div>
</div>
