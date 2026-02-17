import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import TOML from "@iarna/toml";
import type { ConversationTurn } from "../domain/session.js";

interface FilterConfig {
  exclude_patterns: string[];
  exclude_tool_results: boolean;
  min_prompt_length: number;
}

// Stage 1: エージェント指示文パターン（ルールベース高速除外）
const AGENT_INSTRUCTION_PATTERNS = [
  /^You are a /,
  /^You have access to/,
  /^IMPORTANT:/,
  /^Use this tool/,
];

export class PrivacyFilter {
  private excludePatterns: RegExp[];
  private minPromptLength: number;

  private constructor(excludePatterns: RegExp[], minPromptLength: number) {
    this.excludePatterns = excludePatterns;
    this.minPromptLength = minPromptLength;
  }

  static async fromConfig(): Promise<PrivacyFilter> {
    const configPath = join(".intent", "config.toml");

    if (!existsSync(configPath)) {
      return new PrivacyFilter([], 20);
    }

    const content = await readFile(configPath, "utf-8");
    const config = TOML.parse(content) as unknown as { filter: FilterConfig };

    const patterns = config.filter.exclude_patterns.map((p) => {
      // (?i) → RegExp "i" flag
      if (p.startsWith("(?i)")) {
        return new RegExp(p.slice(4), "i");
      }
      return new RegExp(p);
    });

    return new PrivacyFilter(patterns, config.filter.min_prompt_length);
  }

  filterTurns(turns: ConversationTurn[]): ConversationTurn[] {
    return turns.filter((turn) => {
      const prompt = turn.userPrompt;

      // 短すぎるプロンプトを除外
      if (prompt.length < this.minPromptLength) {
        return false;
      }

      // ユーザー設定のパターンマッチで除外
      for (const pattern of this.excludePatterns) {
        if (pattern.test(prompt)) {
          return false;
        }
      }

      // エージェント指示文パターンで除外
      for (const pattern of AGENT_INSTRUCTION_PATTERNS) {
        if (pattern.test(prompt)) {
          return false;
        }
      }

      return true;
    });
  }
}
