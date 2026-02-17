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

    let content: string;
    try {
      content = await readFile(configPath, "utf-8");
    } catch {
      console.warn("config.toml の読み込みに失敗。デフォルト設定を使用します。");
      return new PrivacyFilter([], 20);
    }

    let config: { filter?: Partial<FilterConfig> };
    try {
      config = TOML.parse(content) as unknown as { filter?: Partial<FilterConfig> };
    } catch (e) {
      throw new Error(`config.toml のパースに失敗: ${e instanceof Error ? e.message : e}`);
    }

    const filterConfig = config.filter;
    if (!filterConfig) {
      return new PrivacyFilter([], 20);
    }

    const patterns: RegExp[] = [];
    for (const p of filterConfig.exclude_patterns ?? []) {
      try {
        if (p.startsWith("(?i)")) {
          patterns.push(new RegExp(p.slice(4), "i"));
        } else {
          patterns.push(new RegExp(p));
        }
      } catch (e) {
        console.warn(`無効な正規表現パターン "${p}" をスキップ: ${e instanceof Error ? e.message : e}`);
      }
    }

    return new PrivacyFilter(patterns, filterConfig.min_prompt_length ?? 20);
  }

  filterTurns(turns: ConversationTurn[]): ConversationTurn[] {
    return turns.filter((turn) => {
      const prompt = turn.userPrompt;

      // 短すぎるプロンプトを除外（ただしツール使用や応答がある場合は意図あり）
      if (prompt.length < this.minPromptLength) {
        const hasActivity = turn.toolUses.length > 0 || turn.assistantText.length > 0;
        if (!hasActivity) {
          return false;
        }
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
