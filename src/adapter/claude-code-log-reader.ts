import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, sep } from "node:path";
import { homedir } from "node:os";
import { SessionEntry, type ConversationTurn } from "../domain/session.js";
import type { AgentLogReader } from "../port/agent-log-reader.js";

export class ClaudeCodeLogReader implements AgentLogReader {
  private projectDir: string;

  private constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  static create(): ClaudeCodeLogReader {
    const home = homedir();
    const projectsDir = join(home, ".claude", "projects");
    const cwd = process.cwd();
    const encoded = encodePath(cwd);
    const projectDir = join(projectsDir, encoded);

    if (!existsSync(projectDir)) {
      throw new Error(
        `Claude Codeのプロジェクトディレクトリが見つかりません: ${projectDir}\n` +
          `このディレクトリでClaude Codeを使ったことがあるか確認してください`
      );
    }

    return new ClaudeCodeLogReader(projectDir);
  }

  async listSessions(): Promise<string[]> {
    const entries = await readdir(this.projectDir);
    const jsonlFiles = entries.filter((e) => e.endsWith(".jsonl"));

    const filesWithTime = await Promise.all(
      jsonlFiles.map(async (f) => {
        const s = await stat(join(this.projectDir, f));
        return { name: f.replace(/\.jsonl$/, ""), time: s.birthtimeMs };
      })
    );

    filesWithTime.sort((a, b) => a.time - b.time);
    return filesWithTime.map((f) => f.name);
  }

  async getSessionTimestamp(sessionId: string): Promise<Date> {
    validateSessionId(sessionId);
    const path = join(this.projectDir, `${sessionId}.jsonl`);
    if (!existsSync(path)) {
      throw new Error(`セッション '${sessionId}' のログが見つかりません`);
    }
    const s = await stat(path);
    return s.birthtime;
  }

  async readSession(sessionId: string): Promise<ConversationTurn[]> {
    validateSessionId(sessionId);
    const path = join(this.projectDir, `${sessionId}.jsonl`);
    if (!existsSync(path)) {
      throw new Error(`セッション '${sessionId}' のログが見つかりません`);
    }
    return parseJsonl(await readFile(path, "utf-8"));
  }
}

function validateSessionId(sessionId: string): void {
  if (sessionId.includes("/") || sessionId.includes("\\") || sessionId.includes("..")) {
    throw new Error(`不正なセッションID: ${sessionId}`);
  }
}

function encodePath(path: string): string {
  const normalized = path.startsWith(sep) ? path.slice(1) : path;
  return `-${normalized.replaceAll(sep, "-")}`;
}

function stripSystemReminders(text: string): string {
  return text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();
}

export function parseJsonl(content: string): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  let currentUserPrompt: string | null = null;
  let currentThinking: string[] = [];
  let currentText: string[] = [];
  let currentTools: string[] = [];
  let currentToolResults: string[] = [];
  let currentSkills: string[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      continue; // JSON parse エラー: 不正な行をスキップ
    }

    let entry: SessionEntry;
    try {
      entry = SessionEntry.parse(raw);
    } catch {
      continue; // スキーマ不一致: 未知のエントリ形式をスキップ
    }

    const message = entry.message;
    if (!message) continue;
    if (entry.isSidechain === true) continue;

    if (message.role === "user") {
      if (typeof message.content === "string") {
        // 前のターンを保存
        if (currentUserPrompt !== null) {
          turns.push({
            userPrompt: currentUserPrompt,
            assistantThinking: currentThinking,
            assistantText: currentText,
            toolUses: currentTools,
            toolResults: currentToolResults,
            skills: currentSkills,
          });
        }
        currentUserPrompt = stripSystemReminders(message.content);
        currentThinking = [];
        currentText = [];
        currentTools = [];
        currentToolResults = [];
        currentSkills = [];
      } else if (Array.isArray(message.content)) {
        // tool_result ブロックの content を蓄積
        for (const block of message.content) {
          if (block.type === "tool_result" && "content" in block) {
            const content = block.content;
            if (typeof content === "string") {
              currentToolResults.push(content);
            } else if (Array.isArray(content)) {
              for (const item of content) {
                if (typeof item === "object" && item !== null && "text" in item) {
                  currentToolResults.push((item as { text: string }).text);
                }
              }
            }
          }
        }
      }
    } else if (message.role === "assistant") {
      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type === "thinking" && "thinking" in block) {
            currentThinking.push(block.thinking as string);
          } else if (block.type === "text" && "text" in block) {
            currentText.push(block.text as string);
          } else if (block.type === "tool_use" && "name" in block) {
            currentTools.push(block.name as string);
            if (block.name === "Skill" && "input" in block) {
              const input = block.input as Record<string, unknown>;
              if (typeof input?.skill === "string") {
                currentSkills.push(input.skill);
              }
            }
          }
        }
      }
    }
  }

  // 最後のターン
  if (currentUserPrompt !== null) {
    turns.push({
      userPrompt: currentUserPrompt,
      assistantThinking: currentThinking,
      assistantText: currentText,
      toolUses: currentTools,
      toolResults: currentToolResults,
      skills: currentSkills,
    });
  }

  return turns;
}
