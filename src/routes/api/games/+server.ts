import { gameManager } from "$lib/server/game-manager";
import type { GameConfig } from "$lib/types";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
  try {
    const config = (await request.json()) as GameConfig;

    if (Array.isArray(config.questions)) {
      config.questions = config.questions.map((q: any) => {
        // Normalize compact `options` + numeric `answers` into internal answers objects
        const opts = Array.isArray(q.options) ? q.options : undefined;
        const ans = Array.isArray(q.answers) ? q.answers : undefined;

        if (
          Array.isArray(opts) &&
          Array.isArray(ans) &&
          ans.length &&
          (typeof ans[0] === "number" || typeof ans[0] === "string")
        ) {
          const built = opts.map((o: any) =>
            typeof o === "string"
              ? { text: o, correct: false }
              : { text: String(o?.text ?? ""), correct: false }
          );
          for (const a of ans) {
            const idx = typeof a === "string" ? parseInt(a, 10) : a;
            if (!Number.isNaN(idx) && built[idx]) built[idx].correct = true;
          }
          q.answers = built;
          delete q.options;
        }

        // Normalize answers to text-only objects (strip images/extra fields)
        if (Array.isArray(q.answers)) {
          q.answers = q.answers.map((a: any) =>
            typeof a === "string"
              ? { text: a, correct: false }
              : { text: String(a?.text ?? ""), correct: !!a?.correct }
          );
        }

        if (!q.answerType && Array.isArray(q.answers)) {
          const correctCount = q.answers.filter((a: any) => !!a.correct).length;
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
