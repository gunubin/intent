import { describe, it, expect, beforeAll } from "vitest";
import { PrivacyFilter } from "../privacy-filter.js";
import type { ConversationTurn } from "../../domain/session.js";

function makeTurn(prompt: string): ConversationTurn {
  return {
    userPrompt: prompt,
    assistantThinking: [],
    assistantText: [],
    toolUses: [],
    skills: [],
  };
}

describe("PrivacyFilter", () => {
  // fromConfig はファイルシステム依存のため、フィルタリングロジックのみテスト
  // config.toml が存在しない場合のデフォルト（excludePatterns: [], minPromptLength: 20）

  let filter: PrivacyFilter;

  beforeAll(async () => {
    // cwd に .intent/config.toml がない場合、デフォルト設定で生成される
    filter = await PrivacyFilter.fromConfig();
  });

  it("短文（20文字未満）を除外する", () => {
    const turns = [makeTurn("短い")];
    const filtered = filter.filterTurns(turns);
    expect(filtered).toHaveLength(0);
  });

  it("system-reminder除去済みのプロンプトはフィルタを通過する", () => {
    // パーサーでsystem-reminderが除去された後の状態をテスト
    const turns = [
      makeTurn(
        "ユーザー認証機能を追加してください。JWTを使ってください。"
      ),
    ];
    const filtered = filter.filterTurns(turns);
    expect(filtered).toHaveLength(1);
  });

  it("エージェント指示文パターン 'You are a ' を除外する", () => {
    const turns = [
      makeTurn("You are a professional coding assistant and should..."),
    ];
    const filtered = filter.filterTurns(turns);
    expect(filtered).toHaveLength(0);
  });

  it("正常なプロンプトは通過する", () => {
    const turns = [
      makeTurn("ユーザー認証機能を追加してください。JWTを使ってください。"),
    ];
    const filtered = filter.filterTurns(turns);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].userPrompt).toBe(
      "ユーザー認証機能を追加してください。JWTを使ってください。"
    );
  });

  it("複数ターンのフィルタリング", () => {
    const turns = [
      makeTurn("短い"),
      makeTurn("これは十分に長い正常なプロンプトです。テスト追加をお願いします。"),
      makeTurn("You are a professional coding assistant and should..."),
      makeTurn("ログイン画面のバグを修正してください。エラーが出ます。"),
    ];
    const filtered = filter.filterTurns(turns);
    expect(filtered).toHaveLength(2);
    expect(filtered[0].userPrompt).toContain("正常なプロンプト");
    expect(filtered[1].userPrompt).toContain("ログイン画面");
  });
});
