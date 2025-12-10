import { gameManager } from "$lib/server/game-manager";
import type { GameConfig } from "$lib/types";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
  try {
    const config = (await request.json()) as GameConfig;

    if (Array.isArray(config.questions)) {
      config.questions = config.questions.map((q) => {
        if (!q.answerType && Array.isArray(q.answers)) {
          const correctCount = q.answers.filter((a) => !!a.correct).length;
          q.answerType = correctCount > 1 ? "multiple" : "single";
        }
        return q;
      });
    }

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
