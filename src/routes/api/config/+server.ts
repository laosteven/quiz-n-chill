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
          const q = qRaw as Record<string, unknown>;
          const answers = q.answers as unknown[] | undefined;
          if (!q.answerType && Array.isArray(answers)) {
            const correctCount = answers.filter((a) => !!((a as Record<string, unknown>)?.correct)).length;
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
