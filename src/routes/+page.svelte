<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import type { GameConfig } from "$lib/types";

  let availableGames = $state<string[]>([]);
  let selectedGame = $state("");
  let loading = $state(false);

  onMount(async () => {
    const response = await fetch("/api/config");
    if (response.ok) {
      const data = await response.json();
      availableGames = data.files;
      if (availableGames.length > 0) {
        selectedGame = availableGames[0];
      }
    }
  });

  async function createGame() {
    if (!selectedGame) return;

    loading = true;
    try {
      // Load game config
      const configResponse = await fetch(`/api/config?file=${selectedGame}`);
      if (!configResponse.ok) throw new Error("Failed to load config");

      const { config } = (await configResponse.json()) as { config: GameConfig };

      // Create game
      const gameResponse = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!gameResponse.ok) throw new Error("Failed to create game");

      const { gameId } = await gameResponse.json();
      goto(`/host/${gameId}`);
    } catch (error) {
      console.error("Error creating game:", error);
      alert("Failed to create game. Please try again.");
    } finally {
      loading = false;
    }
  }
</script>

<div
  class="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 flex items-center justify-center p-4"
>
  <div class="max-w-2xl w-full">
    <div class="text-center mb-12">
      <h1 class="text-6xl font-bold text-white mb-4">Quiz n' Chill</h1>
      <p class="text-xl text-white/90">Your self-hosted Kahoot alternative</p>
    </div>

    <div class="bg-white rounded-2xl shadow-2xl p-8">
      <h2 class="text-2xl font-bold mb-6">Create a new game</h2>

      <div class="space-y-6">
        <div>
          <label for="game-select" class="block text-sm font-medium text-gray-700 mb-2">
            Select game configuration
          </label>
          <select
            id="game-select"
            bind:value={selectedGame}
            class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-600 focus:outline-none text-lg"
          >
            {#each availableGames as game}
              <option value={game}>{game}</option>
            {/each}
          </select>
        </div>

        <button
          onclick={createGame}
          disabled={loading || !selectedGame}
          class="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-4 px-6 rounded-lg font-bold text-xl hover:from-purple-700 hover:to-pink-700 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed transition-all"
        >
          {loading ? "Creating Game..." : "Create Game as Host"}
        </button>
      </div>
    </div>

    <div class="text-center mt-8">
      <p class="text-white/80 text-sm">
        Game configurations are stored in the <code class="bg-white/20 px-2 py-1 rounded"
          >games/</code
        > directory
      </p>
    </div>
  </div>
</div>
