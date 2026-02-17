import { describe, it, expect } from "vitest";
import { SessionEntry, summaryContext, type ConversationTurn } from "../session.js";

describe("SessionEntry.parse", () => {
  it("userエントリ（文字列content）をパースできる", () => {
    const entry = SessionEntry.parse({
      type: "user",
      message: { role: "user", content: "こんにちは" },
    });
    expect(entry.type).toBe("user");
    expect(entry.message?.role).toBe("user");
    expect(entry.message?.content).toBe("こんにちは");
  });

  it("assistantエントリ（配列content）をパースできる", () => {
    const entry = SessionEntry.parse({
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "応答テキスト" },
          { type: "thinking", thinking: "思考中..." },
        ],
      },
    });
    expect(entry.type).toBe("assistant");
    expect(Array.isArray(entry.message?.content)).toBe(true);
  });

  it("isSidechainフィールドをパースできる", () => {
    const entry = SessionEntry.parse({
      type: "user",
      isSidechain: true,
      message: { role: "user", content: "サイドチェーン" },
    });
    expect(entry.isSidechain).toBe(true);
  });

  it("isSidechainが省略されている場合はundefined", () => {
    const entry = SessionEntry.parse({
      type: "user",
      message: { role: "user", content: "通常" },
    });
    expect(entry.isSidechain).toBeUndefined();
  });

  it("messageなしのエントリもパースできる", () => {
    const entry = SessionEntry.parse({
      type: "progress",
    });
    expect(entry.type).toBe("progress");
    expect(entry.message).toBeUndefined();
  });
});

describe("summaryContext", () => {
  it("全フィールドを含むコンテキストを生成する", () => {
    const turn: ConversationTurn = {
      userPrompt: "機能を追加して",
      assistantThinking: ["考え中..."],
      assistantText: ["了解しました"],
      toolUses: ["Read", "Edit"],
      skills: [],
    };
    const ctx = summaryContext(turn);

    expect(ctx).toContain("## ユーザーの指示\n機能を追加して");
    expect(ctx).toContain("## AIの思考\n考え中...");
    expect(ctx).toContain("## AIの応答\n了解しました");
    expect(ctx).toContain("## 使用ツール\nRead, Edit");
  });

  it("空の配列フィールドは省略される", () => {
    const turn: ConversationTurn = {
      userPrompt: "質問",
      assistantThinking: [],
      assistantText: [],
      toolUses: [],
      skills: [],
    };
    const ctx = summaryContext(turn);

    expect(ctx).toContain("## ユーザーの指示");
    expect(ctx).not.toContain("## AIの思考");
    expect(ctx).not.toContain("## AIの応答");
    expect(ctx).not.toContain("## 使用ツール");
  });
});
