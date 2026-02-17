import type { AgentLogReader } from "../port/agent-log-reader.js";
import type { Summarizer, StepDraft } from "../port/summarizer.js";
import type { PrivacyFilter } from "../adapter/privacy-filter.js";
import type { FileSystemRepository } from "../adapter/filesystem-repository.js";
import type { Step } from "../domain/step.js";
import type { ConversationTurn } from "../domain/session.js";

const ERROR_PATTERNS = [
  /^error[\[:\s]/im,
  /^Error:/m,
  /tool_use_error/,
  /ENOENT/,
  /EACCES/,
  /TypeError:/,
  /SyntaxError:/,
  /ReferenceError:/,
  /exit code [1-9]/,
  /non-zero exit/,
  /command not found/,
  /No such file or directory$/m,
];

export function extractFriction(turns: ConversationTurn[]): string {
  const frictions: string[] = [];

  // エラーパターン検出
  for (const turn of turns) {
    for (const result of turn.toolResults) {
      for (const pattern of ERROR_PATTERNS) {
        if (pattern.test(result)) {
          const firstLine = result.split("\n").find((l) => pattern.test(l));
          if (firstLine) {
            const trimmed = firstLine.trim().slice(0, 200);
            if (!frictions.includes(trimmed)) {
              frictions.push(trimmed);
            }
          }
          break;
        }
      }
    }
  }

  // 同じ tool_use の連続リトライ検出
  const toolSequence = turns.flatMap((t) => t.toolUses);
  let consecutive = 1;
  for (let i = 1; i < toolSequence.length; i++) {
    if (toolSequence[i] === toolSequence[i - 1]) {
      consecutive++;
    } else {
      if (consecutive >= 3) {
        frictions.push(`${toolSequence[i - 1]}のリトライ ${consecutive}回`);
      }
      consecutive = 1;
    }
  }
  if (consecutive >= 3 && toolSequence.length > 0) {
    frictions.push(`${toolSequence[toolSequence.length - 1]}のリトライ ${consecutive}回`);
  }

  return frictions.join("; ");
}

export class CollectUseCase {
  constructor(
    private reader: AgentLogReader,
    private summarizer: Summarizer,
    private filter: PrivacyFilter,
    private repository: FileSystemRepository
  ) {}

  async collectAll(): Promise<void> {
    const sessions = await this.reader.listSessions();

    if (sessions.length === 0) {
      console.log(
        "このプロジェクトにClaude Codeのセッションが見つかりません。"
      );
      return;
    }

    let collected = 0;
    let skipped = 0;
    let failed = 0;

    for (const sessionId of sessions) {
      if (await this.repository.isSessionCollected(sessionId)) {
        skipped++;
        continue;
      }
      try {
        const result = await this.collectSession(sessionId);
        if (result) collected++;
      } catch (e) {
        failed++;
        console.error(
          `セッション '${sessionId}' の収集に失敗: ${e instanceof Error ? e.message : e}`
        );
      }
    }

    const parts = [`${collected}個収集`, `${skipped}個スキップ（収集済み）`];
    if (failed > 0) parts.push(`${failed}個失敗`);
    parts.push(`${sessions.length}個合計`);
    console.log(`\n完了: ${parts.join(", ")}`);
  }

  async collectSession(sessionId: string): Promise<boolean> {
    if (await this.repository.isSessionCollected(sessionId)) {
      console.log(
        `セッション '${sessionId}' は既に収集済みです。スキップします。`
      );
      return false;
    }

    console.log(`セッション '${sessionId}' を読み込み中...`);
    const turns = await this.reader.readSession(sessionId);

    if (turns.length === 0) {
      console.log("  → 会話ターンなし。スキップ。");
      return false;
    }

    if (turns[0].userPrompt.startsWith("Implement the following plan:")) {
      const planDraft = parsePlanText(turns[0].userPrompt);
      if (!planDraft) {
        console.log("  → プラン自動実行セッション（Context なし）。通常フローへ。");
      } else {
        console.log("  → プラン実行セッションから意図を抽出。");
        const stepNumber = await this.repository.nextStepNumber();
        const timestamp = await this.reader.getSessionTimestamp(sessionId);
        const step: Step = {
          number: stepNumber,
          title: planDraft.title,
          session: sessionId,
          timestamp,
          tags: planDraft.tags ?? [],
          relatedSteps: [],
          prompt: planDraft.prompt,
          reasoning: planDraft.reasoning,
          outcome: planDraft.outcome,
          friction: extractFriction(turns),
        };
        await this.repository.saveStep(step);
        await this.repository.recordSession(sessionId);
        console.log(
          `  → ステップ ${String(step.number).padStart(3, "0")} を生成: ${step.title}`
        );
        return true;
      }
    }

    const skillDraft = parseSkillSession(turns);
    if (skillDraft) {
      console.log(`  → スキル実行セッションから意図を抽出。`);
      const stepNumber = await this.repository.nextStepNumber();
      const timestamp = await this.reader.getSessionTimestamp(sessionId);
      const step: Step = {
        number: stepNumber,
        title: skillDraft.title,
        session: sessionId,
        timestamp,
        tags: skillDraft.tags ?? [],
        relatedSteps: [],
        prompt: skillDraft.prompt,
        reasoning: skillDraft.reasoning,
        outcome: skillDraft.outcome,
        friction: extractFriction(turns),
      };
      await this.repository.saveStep(step);
      await this.repository.recordSession(sessionId);
      console.log(
        `  → ステップ ${String(step.number).padStart(3, "0")} を生成: ${step.title}`
      );
      return true;
    }

    console.log(`  → ${turns.length}個の会話ターンを検出`);

    const filtered = this.filter.filterTurns(turns);

    if (filtered.length === 0) {
      console.log("  → フィルタ後、有効なターンなし。スキップ。");
      await this.repository.recordSession(sessionId);
      return false;
    }

    console.log(
      `  → フィルタ後: ${filtered.length}個のターン。claude で要約を生成中...`
    );

    const previousSteps = await this.repository.listSteps();
    const draft = await this.summarizer.summarize(filtered, previousSteps);

    if (!draft) {
      console.log("  → 人間の意図が読み取れないセッション。スキップ。");
      await this.repository.recordSession(sessionId);
      return false;
    }

    const stepNumber = await this.repository.nextStepNumber();
    const timestamp = await this.reader.getSessionTimestamp(sessionId);

    const step: Step = {
      number: stepNumber,
      title: draft.title,
      session: sessionId,
      timestamp,
      tags: draft.tags ?? [],
      relatedSteps: draft.relatedSteps ?? [],
      prompt: draft.prompt,
      reasoning: draft.reasoning,
      outcome: draft.outcome,
      friction: extractFriction(turns),
    };

    await this.repository.saveStep(step);
    await this.repository.recordSession(sessionId);

    console.log(
      `  → ステップ ${String(step.number).padStart(3, "0")} を生成: ${step.title}`
    );

    return true;
  }
}

export function parseSkillSession(turns: ConversationTurn[]): StepDraft | null {
  // 全ターンからスキル名を収集
  const skills: string[] = [];
  for (const turn of turns) {
    skills.push(...turn.skills);
  }
  if (skills.length === 0) return null;

  // スキル名を正規化（namespaced の場合は後半を使用: "commit-commands:commit" → "commit"）
  const names = skills.map((s) => {
    const parts = s.split(":");
    return parts[parts.length - 1];
  });
  const unique = [...new Set(names)];
  const label = unique.join(", ");

  return {
    title: `/${unique[0]} スキル実行`,
    prompt: turns[0].userPrompt || `/${unique[0]}`,
    reasoning: unique.length > 1 ? `実行スキル: ${label}` : "",
    outcome: `${label} を実行完了`,
    tags: ["skill"],
  };
}

export function parsePlanText(prompt: string): StepDraft | null {
  const body = prompt.replace(/^Implement the following plan:\s*/, "").trim();
  if (!body) return null;

  // # タイトル を抽出
  const titleMatch = body.match(/^#\s+(.+)/m);
  if (!titleMatch) return null;

  let title = titleMatch[1].trim();
  if ([...title].length > 30) {
    title = [...title].slice(0, 30).join("");
  }

  // ## Context セクションを抽出
  const contextMatch = body.match(
    /##\s*Context\s*\n([\s\S]*?)(?=\n##\s|$)/
  );
  if (!contextMatch) return null;

  const context = contextMatch[1].trim();
  if (!context) return null;

  // 変更セクションからファイル一覧を抽出
  const files: string[] = [];
  const changeSection = body.match(
    /##\s*変更\s*\n([\s\S]*?)(?=\n##\s*検証|$)/
  );
  if (changeSection) {
    const fileMatches = changeSection[1].matchAll(
      /###\s*\d+\.\s*`([^`]+)`/g
    );
    for (const m of fileMatches) {
      files.push(m[1]);
    }
  }

  const reasoning = files.length > 0
    ? `変更対象: ${files.join(", ")}`
    : "";

  return {
    title,
    prompt: context,
    reasoning,
    outcome: `${title}の実装完了`,
    tags: ["plan"],
  };
}
