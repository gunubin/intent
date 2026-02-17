import { describe, it, expect } from "vitest";
import { parsePlanText, parseSkillSession } from "../collect.js";
import type { ConversationTurn } from "../../domain/session.js";

function makeTurn(
  prompt: string,
  skills: string[] = [],
  toolUses: string[] = []
): ConversationTurn {
  return {
    userPrompt: prompt,
    assistantThinking: [],
    assistantText: [],
    toolUses,
    skills,
  };
}

const planPrompt = `Implement the following plan:

# プラン実行セッションからの意図抽出

## Context

\`intent collect\` で claude-panes プロジェクトを収集すると、22セッション中 3つしか収集されない。調査の結果、17セッションが \`Implement the following plan:\` で始まるプラン実行セッションで、一律スキップされていた。

## 変更

### 1. \`src/usecase/collect.ts\` — プラン実行セッションの処理

parsePlanText() ヘルパーを追加。

### 2. \`src/adapter/claude-code-summarizer.ts\` — プロンプト修正

skip 指示を削除。

### 3. テスト追加

テストを新規作成。

## 検証

npm run build && npm test
`;

describe("parsePlanText", () => {
  it("タイトルと Context を正しく抽出する", () => {
    const draft = parsePlanText(planPrompt);
    expect(draft).not.toBeNull();
    expect(draft!.title).toBe("プラン実行セッションからの意図抽出");
    expect(draft!.prompt).toContain("intent collect");
    expect(draft!.prompt).toContain("一律スキップされていた");
    expect(draft!.tags).toEqual(["plan"]);
    expect(draft!.outcome).toContain("実装完了");
  });

  it("変更セクションからファイル一覧を reasoning に含める", () => {
    const draft = parsePlanText(planPrompt);
    expect(draft).not.toBeNull();
    expect(draft!.reasoning).toContain("src/usecase/collect.ts");
    expect(draft!.reasoning).toContain("src/adapter/claude-code-summarizer.ts");
  });

  it("Context なしのプランで null を返す", () => {
    const noContext = `Implement the following plan:

# タイトルだけのプラン

## 変更

何かの変更
`;
    const draft = parsePlanText(noContext);
    expect(draft).toBeNull();
  });

  it("長いタイトルが30文字に切り詰められる", () => {
    const longTitle = `Implement the following plan:

# これは非常に長いタイトルで30文字を超えるため切り詰めが必要になるはずです

## Context

何かのコンテキスト。
`;
    const draft = parsePlanText(longTitle);
    expect(draft).not.toBeNull();
    expect(draft!.title.length).toBeLessThanOrEqual(30);
  });

  it("プレフィックスのみで本文がない場合は null を返す", () => {
    const draft = parsePlanText("Implement the following plan:");
    expect(draft).toBeNull();
  });

  it("タイトルがない場合は null を返す", () => {
    const noTitle = `Implement the following plan:

## Context

何かのコンテキスト。
`;
    const draft = parsePlanText(noTitle);
    expect(draft).toBeNull();
  });
});

describe("parseSkillSession", () => {
  it("Skill tool_use を含むセッションから StepDraft を生成する", () => {
    const turns = [makeTurn("/commit", ["commit"], ["Skill"])];
    const draft = parseSkillSession(turns);
    expect(draft).not.toBeNull();
    expect(draft!.title).toBe("/commit スキル実行");
    expect(draft!.prompt).toBe("/commit");
    expect(draft!.tags).toEqual(["skill"]);
    expect(draft!.outcome).toContain("commit");
  });

  it("namespaced スキル名を正規化する", () => {
    const turns = [
      makeTurn("/commit", ["commit-commands:commit"], ["Skill"]),
    ];
    const draft = parseSkillSession(turns);
    expect(draft).not.toBeNull();
    expect(draft!.title).toBe("/commit スキル実行");
  });

  it("skills が空のセッションでは null を返す", () => {
    const turns = [makeTurn("通常の質問", [], ["Read", "Edit"])];
    const draft = parseSkillSession(turns);
    expect(draft).toBeNull();
  });

  it("複数ターンにまたがるスキルを集約する", () => {
    const turns = [
      makeTurn("/review-pr", ["code-review:code-review"], ["Skill"]),
      makeTurn("修正して", ["commit-commands:commit"], ["Skill"]),
    ];
    const draft = parseSkillSession(turns);
    expect(draft).not.toBeNull();
    expect(draft!.title).toBe("/code-review スキル実行");
    expect(draft!.reasoning).toContain("code-review");
    expect(draft!.reasoning).toContain("commit");
  });

  it("userPrompt が空でもスキル名をフォールバックに使う", () => {
    const turns = [makeTurn("", ["commit"], ["Skill"])];
    const draft = parseSkillSession(turns);
    expect(draft).not.toBeNull();
    expect(draft!.prompt).toBe("/commit");
  });
});
