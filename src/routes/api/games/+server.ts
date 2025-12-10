import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import type { GameConfig } from "$lib/types";
import { gameManager } from "$lib/server/game-manager";

export const POST: RequestHandler = async ({ request }) => {
  try {
    const config = (await request.json()) as GameConfig;

    // Basic validation to avoid runtime 500s
    if (!config || !config.questions || !Array.isArray(config.questions) || !config.settings) {
      return json({ error: "Invalid game configuration" }, { status: 400 });
    }

    const gameId = gameManager.createGame(config);
    console.log(`🎮 New game created with ID: ${gameId}`);

    return json({ gameId, success: true });
  } catch (err) {
    console.error("Failed to create game:", err);
    return json({ error: "Failed to create game" }, { status: 500 });
  }
};
