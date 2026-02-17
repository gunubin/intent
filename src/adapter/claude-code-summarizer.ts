import { spawn } from "node:child_process";
import { z } from "zod/v4";
import { summaryContext, type ConversationTurn } from "../domain/session.js";
import type { Step } from "../domain/step.js";
import type { StepDraft, Summarizer } from "../port/summarizer.js";

const SUBPROCESS_TIMEOUT_MS = 120_000;

const StepDraftSchema = z.object({
  title: z.string(),
  prompt: z.string(),
  reasoning: z.string(),
  outcome: z.string(),
  tags: z.array(z.string()).optional(),
  relatedSteps: z.array(z.number()).optional(),
  skip: z.boolean().optional(),
});

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
- relatedSteps: 前のステップと関連がある場合、そのステップ番号の配列。例: [3, 5]。関連がなければ省略

必ず以下のJSON形式のみを出力してください（他のテキストは不要）:
{"title":"...","prompt":"...","reasoning":"...","outcome":"...","tags":["..."],"relatedSteps":[...]}

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

    const { stdout } = await runClaude(prompt, env);

    const response = stdout.trim();
    const jsonStr = extractJson(response);
    if (!jsonStr) {
      throw new Error(
        `claudeの応答からJSONを抽出できませんでした: ${response}`
      );
    }

    const parsed = JSON.parse(jsonStr);

    if (parsed.skip === true) {
      return null;
    }

    return StepDraftSchema.parse(parsed);
  }
}

function runClaude(
  prompt: string,
  env: NodeJS.ProcessEnv
): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p", "--no-session-persistence"], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`claude コマンドがタイムアウトしました (${SUBPROCESS_TIMEOUT_MS / 1000}秒)`));
    }, SUBPROCESS_TIMEOUT_MS);

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(
        new Error(
          `claude コマンドの実行に失敗。claude CLIがインストールされているか確認してください: ${err.message}`
        )
      );
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`claude コマンドがエラーを返しました (code ${code}): ${stderr}`));
      } else {
        resolve({ stdout });
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
