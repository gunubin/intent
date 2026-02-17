import { describe, it, expect } from "vitest";
import { toMarkdown, fromMarkdown, type Step } from "../step.js";

const baseStep: Step = {
  number: 1,
  title: "テスト機能追加",
  session: "abc-123",
  timestamp: new Date("2025-01-15T10:30:00Z"),
  tags: ["feature", "test"],
  relatedSteps: [],
  prompt: "テスト機能を追加してください",
  reasoning: "品質向上のため",
  outcome: "テストが追加された",
  friction: "型エラーが発生した",
};

describe("toMarkdown", () => {
  it("全フィールドを正常に出力する", () => {
    const md = toMarkdown(baseStep);

    expect(md).toContain("step: 1");
    expect(md).toContain('title: "テスト機能追加"');
    expect(md).toContain('session: "abc-123"');
    expect(md).toContain("timestamp: 2025-01-15T10:30:00Z");
    expect(md).toContain("tags: [feature, test]");
    expect(md).toContain("related: []");
    expect(md).toContain("## prompt\n\nテスト機能を追加してください");
    expect(md).toContain("## reasoning\n\n品質向上のため");
    expect(md).toContain("## outcome\n\nテストが追加された");
    expect(md).toContain("## friction\n\n型エラーが発生した");
  });

  it("frictionが空なら省略する", () => {
    const step: Step = { ...baseStep, friction: "" };
    const md = toMarkdown(step);

    expect(md).not.toContain("## friction");
  });

  it("tagsが空なら[]を出力する", () => {
    const step: Step = { ...baseStep, tags: [] };
    const md = toMarkdown(step);

    expect(md).toContain("tags: []");
  });
});

describe("fromMarkdown", () => {
  it("正常にパースできる", () => {
    const md = toMarkdown(baseStep);
    const parsed = fromMarkdown(md);

    expect(parsed.number).toBe(1);
    expect(parsed.title).toBe("テスト機能追加");
    expect(parsed.session).toBe("abc-123");
    expect(parsed.timestamp.toISOString()).toBe("2025-01-15T10:30:00.000Z");
    expect(parsed.tags).toEqual(["feature", "test"]);
    expect(parsed.relatedSteps).toEqual([]);
    expect(parsed.prompt).toBe("テスト機能を追加してください");
    expect(parsed.reasoning).toBe("品質向上のため");
    expect(parsed.outcome).toBe("テストが追加された");
    expect(parsed.friction).toBe("型エラーが発生した");
  });

  it("frontmatterがなければエラー", () => {
    expect(() => fromMarkdown("no frontmatter")).toThrow(
      "frontmatterが見つかりません"
    );
  });

  it("frontmatter終了がなければエラー", () => {
    expect(() => fromMarkdown("---\nstep: 1\n")).toThrow(
      "frontmatterの終了が見つかりません"
    );
  });

  it("toMarkdown → fromMarkdown のラウンドトリップ", () => {
    const md = toMarkdown(baseStep);
    const parsed = fromMarkdown(md);
    const md2 = toMarkdown(parsed);
    expect(md).toBe(md2);
  });

  it("relatedSteps のラウンドトリップ", () => {
    const step: Step = { ...baseStep, relatedSteps: [1, 3, 5] };
    const md = toMarkdown(step);
    expect(md).toContain("related: [1, 3, 5]");
    const parsed = fromMarkdown(md);
    expect(parsed.relatedSteps).toEqual([1, 3, 5]);
  });

  it("related フィールドがないマークダウンでも空配列になる", () => {
    const mdWithoutRelated = `---
step: 1
title: "テスト"
session: "abc"
timestamp: 2025-01-15T10:30:00Z
tags: []
---

## prompt

test

## reasoning

test

## outcome

test
`;
    const parsed = fromMarkdown(mdWithoutRelated);
    expect(parsed.relatedSteps).toEqual([]);
  });
});
