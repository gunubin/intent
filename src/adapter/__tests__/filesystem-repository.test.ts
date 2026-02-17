import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import TOML from "@iarna/toml";
import { FileSystemRepository } from "../filesystem-repository.js";
import type { Step } from "../../domain/step.js";

const TEST_DIR = ".intent-test-tmp";

function setupIntentDir() {
  mkdirSync(join(TEST_DIR, "steps"), { recursive: true });
  const intentToml = {
    project: {
      name: "test",
      description: "test project",
      origin: "test",
      author: "test",
      forked_from: "",
      forked_at_step: 0,
    },
    source: {
      tool: "claude-code",
      version: "1.0.0",
      model: "opus",
    },
    collect: {
      sessions: [] as string[],
    },
  };
  writeFileSync(
    join(TEST_DIR, "intent.toml"),
    TOML.stringify(intentToml as unknown as TOML.JsonMap)
  );
}

function createRepo(): FileSystemRepository {
  // FileSystemRepository.create() は ".intent" をハードコードしているため、
  // テスト用にリフレクションでインスタンスを生成
  const repo = Object.create(FileSystemRepository.prototype);
  repo.intentDir = TEST_DIR;
  return repo as FileSystemRepository;
}

describe("FileSystemRepository", () => {
  beforeEach(() => {
    setupIntentDir();
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe("listSteps", () => {
    it("空ディレクトリでは空配列を返す", async () => {
      const repo = createRepo();
      const steps = await repo.listSteps();
      expect(steps).toEqual([]);
    });

    it("複数ステップを番号順で返す", async () => {
      const repo = createRepo();

      const step1 = makeStep(1, "最初のステップ");
      const step2 = makeStep(2, "次のステップ");
      await repo.saveStep(step1);
      await repo.saveStep(step2);

      const steps = await repo.listSteps();
      expect(steps).toHaveLength(2);
      expect(steps[0].number).toBe(1);
      expect(steps[1].number).toBe(2);
    });
  });

  describe("saveStep → getStep ラウンドトリップ", () => {
    it("保存したステップを正しく読み取れる", async () => {
      const repo = createRepo();
      const step = makeStep(1, "テストステップ");
      await repo.saveStep(step);

      const loaded = await repo.getStep(1);
      expect(loaded.number).toBe(step.number);
      expect(loaded.title).toBe(step.title);
      expect(loaded.session).toBe(step.session);
      expect(loaded.prompt).toBe(step.prompt);
      expect(loaded.reasoning).toBe(step.reasoning);
      expect(loaded.outcome).toBe(step.outcome);
      expect(loaded.friction).toBe(step.friction);
      expect(loaded.tags).toEqual(step.tags);
    });
  });

  describe("nextStepNumber", () => {
    it("空の場合は1を返す", async () => {
      const repo = createRepo();
      const next = await repo.nextStepNumber();
      expect(next).toBe(1);
    });

    it("既存ステップがある場合は最大+1を返す", async () => {
      const repo = createRepo();
      await repo.saveStep(makeStep(1, "ステップ1"));
      await repo.saveStep(makeStep(3, "ステップ3"));

      const next = await repo.nextStepNumber();
      expect(next).toBe(4);
    });
  });

  describe("isSessionCollected / recordSession", () => {
    it("未収集セッションはfalseを返す", async () => {
      const repo = createRepo();
      const result = await repo.isSessionCollected("session-1");
      expect(result).toBe(false);
    });

    it("recordSession後はtrueを返す", async () => {
      const repo = createRepo();
      await repo.recordSession("session-1");

      const result = await repo.isSessionCollected("session-1");
      expect(result).toBe(true);
    });

    it("同じセッションを二重登録しない", async () => {
      const repo = createRepo();
      await repo.recordSession("session-1");
      await repo.recordSession("session-1");

      const tomlContent = await repo.readIntentToml();
      const count = tomlContent.collect.sessions.filter(
        (s) => s === "session-1"
      ).length;
      expect(count).toBe(1);
    });
  });

  describe("removeStep", () => {
    it("指定したステップを削除する", async () => {
      const repo = createRepo();
      await repo.saveStep(makeStep(1, "削除対象"));
      await repo.removeStep(1);
      await expect(repo.getStep(1)).rejects.toThrow("見つかりません");
    });

    it("存在しないステップはエラーになる", async () => {
      const repo = createRepo();
      await expect(repo.removeStep(99)).rejects.toThrow("見つかりません");
    });
  });

  describe("reset", () => {
    it("全ステップを削除しセッション履歴をクリアする", async () => {
      const repo = createRepo();
      await repo.saveStep(makeStep(1, "ステップ1"));
      await repo.saveStep(makeStep(2, "ステップ2"));
      await repo.recordSession("session-1");
      await repo.recordSession("session-2");

      await repo.reset();

      const steps = await repo.listSteps();
      expect(steps).toEqual([]);
      const toml = await repo.readIntentToml();
      expect(toml.collect.sessions).toEqual([]);
    });
  });
});

function makeStep(number: number, title: string): Step {
  return {
    number,
    title,
    session: "test-session",
    timestamp: new Date("2025-01-15T10:00:00Z"),
    tags: ["test"],
    relatedSteps: [],
    prompt: "テストプロンプト",
    reasoning: "テスト理由",
    outcome: "テスト結果",
    friction: "",
  };
}
