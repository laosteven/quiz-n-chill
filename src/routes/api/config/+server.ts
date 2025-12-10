import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";
import type { GameConfig } from "$lib/types";

export const GET: RequestHandler = async ({ url }) => {
  const filename = url.searchParams.get("file");

  try {
    if (filename) {
      // Load specific game config
      const filePath = join(process.cwd(), "games", filename);
      const fileContent = readFileSync(filePath, "utf8");
      const config = yaml.load(fileContent) as GameConfig;
      return json({ config });
    } else {
      // List all available game configs
      const gamesDir = join(process.cwd(), "games");
      const files = readdirSync(gamesDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
      return json({ files });
    }
  } catch (error) {
    return json({ error: "Failed to load config" }, { status: 500 });
  }
};
