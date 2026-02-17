import { describe, it, expect, vi } from "vitest";
import { CollectUseCase, parsePlanText, parseSkillSession, extractFriction } from "../collect.js";
import type { ConversationTurn } from "../../domain/session.js";
import type { AgentLogReader } from "../../port/agent-log-reader.js";
import type { Summarizer, StepDraft } from "../../port/summarizer.js";
import type { FileSystemRepository } from "../../adapter/filesystem-repository.js";
import type { PrivacyFilter } from "../../adapter/privacy-filter.js";
import type { Step } from "../../domain/step.js";

function makeTurn(
  prompt: string,
  skills: string[] = [],
  toolUses: string[] = [],
  toolResults: string[] = []
): ConversationTurn {
  return {
    userPrompt: prompt,
    assistantThinking: [],
    assistantText: [],
    toolUses,
    toolResults,
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

// Mock factories
function mockReader(
  sessions: string[],
  turnsMap: Record<string, ConversationTurn[]>
): AgentLogReader {
  return {
    listSessions: vi.fn().mockResolvedValue(sessions),
    readSession: vi.fn().mockImplementation((id: string) =>
      Promise.resolve(turnsMap[id] ?? [])
    ),
    getSessionTimestamp: vi.fn().mockResolvedValue(new Date("2025-01-01")),
  };
}

function mockSummarizer(draft: StepDraft | null = null): Summarizer {
  return {
    summarize: vi.fn().mockResolvedValue(draft),
  };
}

function mockRepository(collectedSessions: string[] = []): FileSystemRepository {
  const steps: Step[] = [];
  let nextNum = 1;
  const collected = new Set(collectedSessions);
  return {
    isSessionCollected: vi.fn().mockImplementation((id: string) =>
      Promise.resolve(collected.has(id))
    ),
    recordSession: vi.fn().mockImplementation((id: string) => {
      collected.add(id);
      return Promise.resolve();
    }),
    nextStepNumber: vi.fn().mockImplementation(() => Promise.resolve(nextNum++)),
    saveStep: vi.fn().mockImplementation((s: Step) => {
      steps.push(s);
      return Promise.resolve();
    }),
    listSteps: vi.fn().mockResolvedValue(steps),
  } as unknown as FileSystemRepository;
}

function mockFilter(): PrivacyFilter {
  return {
    filterTurns: vi.fn().mockImplementation((turns: ConversationTurn[]) => turns),
  } as unknown as PrivacyFilter;
}

describe("CollectUseCase", () => {
  it("プラン実行セッションは summarizer を呼ばずに Step を生成する", async () => {
    const planTurns = [makeTurn(`Implement the following plan:\n\n# テスト機能\n\n## Context\n\nテスト用コンテキスト。\n`)];
    const reader = mockReader(["session-1"], { "session-1": planTurns });
    const summarizer = mockSummarizer();
    const repo = mockRepository();
    const filter = mockFilter();

    const usecase = new CollectUseCase(reader, summarizer, filter, repo);
    const result = await usecase.collectSession("session-1");

    expect(result).toBe(true);
    expect(summarizer.summarize).not.toHaveBeenCalled();
    expect(repo.saveStep).toHaveBeenCalledWith(
      expect.objectContaining({ title: "テスト機能", tags: ["plan"] })
    );
  });

  it("スキルセッションは summarizer を呼ばずに Step を生成する", async () => {
    const skillTurns = [makeTurn("/commit", ["commit"], ["Skill"])];
    const reader = mockReader(["session-1"], { "session-1": skillTurns });
    const summarizer = mockSummarizer();
    const repo = mockRepository();
    const filter = mockFilter();

    const usecase = new CollectUseCase(reader, summarizer, filter, repo);
    const result = await usecase.collectSession("session-1");

    expect(result).toBe(true);
    expect(summarizer.summarize).not.toHaveBeenCalled();
    expect(repo.saveStep).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ["skill"] })
    );
  });

  it("通常セッションは summarizer を呼ぶ", async () => {
    const normalTurns = [makeTurn("認証機能を追加して")];
    const reader = mockReader(["session-1"], { "session-1": normalTurns });
    const draft: StepDraft = {
      title: "認証機能追加",
      prompt: "認証機能を追加",
      reasoning: "",
      outcome: "認証追加完了",
      tags: ["feature"],
    };
    const summarizer = mockSummarizer(draft);
    const repo = mockRepository();
    const filter = mockFilter();

    const usecase = new CollectUseCase(reader, summarizer, filter, repo);
    const result = await usecase.collectSession("session-1");

    expect(result).toBe(true);
    expect(summarizer.summarize).toHaveBeenCalled();
    expect(repo.saveStep).toHaveBeenCalledWith(
      expect.objectContaining({ title: "認証機能追加" })
    );
  });

  it("収集済みセッションはスキップする", async () => {
    const reader = mockReader(["session-1"], { "session-1": [makeTurn("test")] });
    const summarizer = mockSummarizer();
    const repo = mockRepository(["session-1"]);
    const filter = mockFilter();

    const usecase = new CollectUseCase(reader, summarizer, filter, repo);
    const result = await usecase.collectSession("session-1");

    expect(result).toBe(false);
    expect(reader.readSession).not.toHaveBeenCalled();
  });

  it("空セッションは false を返す", async () => {
    const reader = mockReader(["session-1"], { "session-1": [] });
    const summarizer = mockSummarizer();
    const repo = mockRepository();
    const filter = mockFilter();

    const usecase = new CollectUseCase(reader, summarizer, filter, repo);
    const result = await usecase.collectSession("session-1");

    expect(result).toBe(false);
  });
});

describe("extractFriction", () => {
  it("エラーを含む toolResults から friction を抽出する", () => {
    const turns = [
      makeTurn("ビルドして", [], ["Bash"], ["error[E0061]: this function takes 1 argument but 2 arguments were supplied"]),
    ];
    const friction = extractFriction(turns);
    expect(friction).toContain("error[E0061]");
  });

  it("エラーがなければ空文字を返す", () => {
    const turns = [
      makeTurn("ビルドして", [], ["Bash"], ["Build succeeded"]),
    ];
    const friction = extractFriction(turns);
    expect(friction).toBe("");
  });

  it("同じツールの3回以上の連続リトライを検出する", () => {
    const turns = [
      makeTurn("修正して", [], ["Edit", "Edit", "Edit"]),
    ];
    const friction = extractFriction(turns);
    expect(friction).toContain("Editのリトライ 3回");
  });

  it("エラーとリトライの両方を検出する", () => {
    const turns = [
      makeTurn("修正して", [], ["Bash", "Bash", "Bash"], ["Error: command failed"]),
    ];
    const friction = extractFriction(turns);
    expect(friction).toContain("Error: command failed");
    expect(friction).toContain("Bashのリトライ 3回");
  });

  it("重複するエラーは1つにまとめる", () => {
    const turns = [
      makeTurn("修正して", [], [], ["error: something\nmore info"]),
      makeTurn("もう一度", [], [], ["error: something\nmore info"]),
    ];
    const friction = extractFriction(turns);
    const parts = friction.split("; ");
    expect(parts).toHaveLength(1);
  });

  it("コード中の Error 文字列は誤検出しない", () => {
    const turns = [
      makeTurn("ファイル読んで", [], ["Read"], [
        '49→                Status::Error => ("✕", Color::Red),',
      ]),
    ];
    const friction = extractFriction(turns);
    expect(friction).toBe("");
  });

  it("tool_use_error を検出する", () => {
    const turns = [
      makeTurn("修正して", [], ["Edit"], [
        "<tool_use_error>File has been modified since read</tool_use_error>",
      ]),
    ];
    const friction = extractFriction(turns);
    expect(friction).toContain("tool_use_error");
  });
});
