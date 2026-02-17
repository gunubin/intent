import { describe, it, expect } from "vitest";
import { parseJsonl } from "../claude-code-log-reader.js";

function jsonl(...lines: object[]): string {
  return lines.map((l) => JSON.stringify(l)).join("\n");
}

describe("parseJsonl", () => {
  it("人間入力（type:user + content:string）のみを抽出する", () => {
    const content = jsonl(
      {
        type: "user",
        message: { role: "user", content: "最初の質問" },
      },
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "回答" }],
        },
      }
    );
    const turns = parseJsonl(content);

    expect(turns).toHaveLength(1);
    expect(turns[0].userPrompt).toBe("最初の質問");
    expect(turns[0].assistantText).toEqual(["回答"]);
  });

  it("tool_result配列エントリは人間ターンとしてカウントされない", () => {
    const content = jsonl(
      {
        type: "user",
        message: { role: "user", content: "実行して" },
      },
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", name: "Bash" }],
        },
      },
      {
        type: "user",
        message: {
          role: "user",
          content: [{ type: "tool_result", content: "結果" }],
        },
      },
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "完了" }],
        },
      }
    );
    const turns = parseJsonl(content);

    expect(turns).toHaveLength(1);
    expect(turns[0].userPrompt).toBe("実行して");
    expect(turns[0].toolUses).toEqual(["Bash"]);
    expect(turns[0].assistantText).toEqual(["完了"]);
  });

  it("isSidechain:true エントリはスキップされる", () => {
    const content = jsonl(
      {
        type: "user",
        message: { role: "user", content: "通常の質問" },
      },
      {
        type: "assistant",
        isSidechain: true,
        message: {
          role: "assistant",
          content: [{ type: "text", text: "サイドチェーン応答" }],
        },
      },
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "メイン応答" }],
        },
      }
    );
    const turns = parseJsonl(content);

    expect(turns).toHaveLength(1);
    expect(turns[0].assistantText).toEqual(["メイン応答"]);
  });

  it("isSidechain:false エントリは通常通り処理される", () => {
    const content = jsonl(
      {
        type: "user",
        isSidechain: false,
        message: { role: "user", content: "質問" },
      },
      {
        type: "assistant",
        isSidechain: false,
        message: {
          role: "assistant",
          content: [{ type: "text", text: "応答" }],
        },
      }
    );
    const turns = parseJsonl(content);

    expect(turns).toHaveLength(1);
    expect(turns[0].userPrompt).toBe("質問");
  });

  it("空行や不正JSONをスキップする", () => {
    const content = [
      "",
      "  ",
      "not json",
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "有効な入力" },
      }),
      "{invalid json}",
      JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "有効な応答" }],
        },
      }),
    ].join("\n");
    const turns = parseJsonl(content);

    expect(turns).toHaveLength(1);
    expect(turns[0].userPrompt).toBe("有効な入力");
    expect(turns[0].assistantText).toEqual(["有効な応答"]);
  });

  it("複数ターンを正しく区切る", () => {
    const content = jsonl(
      {
        type: "user",
        message: { role: "user", content: "質問1" },
      },
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "回答1" }],
        },
      },
      {
        type: "user",
        message: { role: "user", content: "質問2" },
      },
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "思考中" },
            { type: "text", text: "回答2" },
          ],
        },
      }
    );
    const turns = parseJsonl(content);

    expect(turns).toHaveLength(2);
    expect(turns[0].userPrompt).toBe("質問1");
    expect(turns[0].assistantText).toEqual(["回答1"]);
    expect(turns[1].userPrompt).toBe("質問2");
    expect(turns[1].assistantThinking).toEqual(["思考中"]);
    expect(turns[1].assistantText).toEqual(["回答2"]);
  });

  it("system-reminderタグがユーザープロンプトから除去される", () => {
    const content = jsonl(
      {
        type: "user",
        message: {
          role: "user",
          content:
            "認証機能を追加して\n<system-reminder>\nsome injected context\n</system-reminder>",
        },
      },
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "了解" }],
        },
      }
    );
    const turns = parseJsonl(content);

    expect(turns).toHaveLength(1);
    expect(turns[0].userPrompt).toBe("認証機能を追加して");
  });

  it("複数のsystem-reminderタグがすべて除去される", () => {
    const content = jsonl(
      {
        type: "user",
        message: {
          role: "user",
          content:
            "<system-reminder>first</system-reminder>質問です<system-reminder>second</system-reminder>",
        },
      },
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "回答" }],
        },
      }
    );
    const turns = parseJsonl(content);

    expect(turns).toHaveLength(1);
    expect(turns[0].userPrompt).toBe("質問です");
  });

  it("messageなしのエントリはスキップされる", () => {
    const content = jsonl(
      { type: "progress" },
      {
        type: "user",
        message: { role: "user", content: "質問" },
      },
      { type: "system" },
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "回答" }],
        },
      }
    );
    const turns = parseJsonl(content);

    expect(turns).toHaveLength(1);
    expect(turns[0].userPrompt).toBe("質問");
  });
});
