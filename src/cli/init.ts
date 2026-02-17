import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_INTENT_TOML = `[project]
name = ""
description = ""
origin = ""
author = ""
forked_from = ""
forked_at_step = 0

[source]
tool = "claude-code"
version = ""
model = ""

[collect]
sessions = []
`;

const DEFAULT_CONFIG_TOML = `[filter]
exclude_patterns = [
  "(?i)(api.?key|token|secret|password)",
  "^(はい|ok|yes|y|n|no)$",
  "戻して|取り消し|やっぱ",
]
exclude_tool_results = true
min_prompt_length = 20
`;

export async function initCommand(): Promise<void> {
  const intentDir = ".intent";

  if (existsSync(intentDir)) {
    throw new Error(".intent/ は既に存在します");
  }

  await mkdir(join(intentDir, "steps"), { recursive: true });
  await writeFile(join(intentDir, "intent.toml"), DEFAULT_INTENT_TOML);
  await writeFile(join(intentDir, "config.toml"), DEFAULT_CONFIG_TOML);

  console.log(".intent/ を初期化しました");
}
