import { json } from "@sveltejs/kit";
import { readFileSync, readdirSync } from "fs";
import yaml from "js-yaml";
import { join } from "path";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url }) => {
  const filename = url.searchParams.get("file");

  try {
    if (filename) {
      // Load specific game config
      const filePath = join(process.cwd(), "games", filename);
      const fileContent = readFileSync(filePath, "utf8");
      const raw = yaml.load(fileContent) as unknown;
      const config = (raw as Record<string, unknown>) || {};

      if (Array.isArray(config.questions)) {
        config.questions = (config.questions as unknown[]).map((qRaw) => {
          const q = qRaw as Record<string, any>;

          const opts = Array.isArray(q.options) ? q.options : undefined;
          const ans = Array.isArray(q.answers) ? q.answers : undefined;

          if (
            Array.isArray(opts) &&
            Array.isArray(ans) &&
            ans.length &&
            (typeof ans[0] === "number" || typeof ans[0] === "string")
          ) {
            const built = opts.map((o: any) => {
              if (typeof o === "string") return { text: o, correct: false };
              if (o && typeof o === "object" && "text" in o)
                return { text: String(o.text), correct: false };
              return { text: String(o ?? ""), correct: false };
            });

            // mark correct by index
            for (const a of ans) {
              const idx = typeof a === "string" ? parseInt(a, 10) : a;
              if (!Number.isNaN(idx) && built[idx]) built[idx].correct = true;
            }

            q.answers = built;
            delete q.options;
          }

          // Ensure answerType exists (infer from answers if missing)
          const answersArr = Array.isArray(q.answers) ? q.answers : undefined;
          if (!q.answerType && Array.isArray(answersArr)) {
            const correctCount = answersArr.filter((a: any) => !!a?.correct).length;
            q.answerType = correctCount > 1 ? "multiple" : "single";
          }

          return q;
        });
      }

      return json({ config });
    } else {
      // List all available game configs
      const gamesDir = join(process.cwd(), "games");
      const files = readdirSync(gamesDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
      return json({ files });
    }
  } catch {
    return json({ error: "Failed to load config" }, { status: 500 });
  }
};
