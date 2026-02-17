import { spawn } from "node:child_process";
import { summaryContext, type ConversationTurn } from "../domain/session.js";
import type { Step } from "../domain/step.js";
import type { StepDraft, Summarizer } from "../port/summarizer.js";

const SUMMARIZE_PROMPT = `以下のAIとの会話ターンを分析して、JSON形式で要約してください。

重要な判定基準:
- 会話ターンの中に「人間が明示的に要求した意図」が読み取れるものだけを対象にしてください
- 機械的なやりとり（ツール呼び出しの羅列等）だけの場合は skip: true を返してください

要件:
- title: 何をしたかの短いタイトル（30文字以内）
- prompt: ユーザーが何を指示したかの要約
- reasoning: なぜこの実装になったかの説明（前のステップからの文脈の変化があれば含める）
- outcome: 何ができるようになったかの説明
- tags: 内容を分類する短いタグの配列（1〜4個）。例: ["bugfix"], ["feature","ux"], ["testing","ci"], ["refactor","security"]

必ず以下のJSON形式のみを出力してください（他のテキストは不要）:
{"title":"...","prompt":"...","reasoning":"...","outcome":"...","tags":["..."]}

スキップする場合:
{"skip":true}
`;

export class ClaudeCodeSummarizer implements Summarizer {
  async summarize(
    turns: ConversationTurn[],
    previousSteps: Step[]
  ): Promise<StepDraft | null> {
    if (turns.length === 0) {
      throw new Error("会話ターンが空です");
    }

    let prompt = "";

    if (previousSteps.length > 0) {
      const recent = previousSteps.slice(-5);
      const history = recent
        .map((s) => `- ステップ${String(s.number).padStart(3, "0")}: ${s.title}（${s.prompt}）`)
        .join("\n");
      prompt += `これまでの意図の流れ:\n${history}\n\n上記を踏まえて、以下の新しいセッションを要約してください。前のステップとの関連性や意図の変化があれば reasoning に含めてください。\n\n`;
    }

    prompt += SUMMARIZE_PROMPT;

    const context = turns
      .map((t, i) => `--- ターン ${i + 1} ---\n${summaryContext(t)}`)
      .join("\n\n");

    prompt += `会話ターン:\n${context}`;

    // claude -p でサブプロセス呼び出し（stdin経由でプロンプトを渡す）
    const env = { ...process.env };
    delete env.CLAUDE_CODE;
    delete env.CLAUDECODE;

    const { stdout, stderr } = await runClaude(prompt, env);

    const response = stdout.trim();
    const jsonStr = extractJson(response);
    if (!jsonStr) {
      throw new Error(
        `claudeの応答からJSONを抽出できませんでした: ${response}`
      );
    }

    const draft = JSON.parse(jsonStr) as StepDraft;

    if (draft.skip) {
      return null;
    }

    return draft;
  }
}

function runClaude(
  prompt: string,
  env: NodeJS.ProcessEnv
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p", "--no-session-persistence"], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      reject(
        new Error(
          `claude コマンドの実行に失敗。claude CLIがインストールされているか確認してください: ${err.message}`
        )
      );
    });

    child.on("close", (code) => {
      if (code !== 0 && !stdout) {
        reject(new Error(`claude コマンドがエラーを返しました (code ${code}): ${stderr}`));
      } else {
        resolve({ stdout, stderr });
      }
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function extractJson(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  return text.slice(start, end + 1);
}
