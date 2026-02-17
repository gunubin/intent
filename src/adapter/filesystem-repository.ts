import { readdir, readFile, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import TOML from "@iarna/toml";
import { type Step, fromMarkdown, toMarkdown } from "../domain/step.js";
import type { StepRepository } from "../port/step-repository.js";

interface IntentToml {
  project: {
    name: string;
    description: string;
    origin: string;
    author: string;
    forked_from: string;
    forked_at_step: number;
  };
  source: {
    tool: string;
    version: string;
    model: string;
  };
  collect: {
    sessions: string[];
  };
}

export class FileSystemRepository implements StepRepository {
  private intentDir: string;

  private constructor(intentDir: string) {
    this.intentDir = intentDir;
  }

  static create(): FileSystemRepository {
    const intentDir = ".intent";
    if (!existsSync(intentDir)) {
      throw new Error(
        ".intent/ が見つかりません。`intent init` で初期化してください"
      );
    }
    return new FileSystemRepository(intentDir);
  }

  private stepsDir(): string {
    return join(this.intentDir, "steps");
  }

  private stepPath(number: number): string {
    return join(this.stepsDir(), `${String(number).padStart(3, "0")}.md`);
  }

  private intentTomlPath(): string {
    return join(this.intentDir, "intent.toml");
  }

  async readIntentToml(): Promise<IntentToml> {
    const content = await readFile(this.intentTomlPath(), "utf-8");
    return TOML.parse(content) as unknown as IntentToml;
  }

  async writeIntentToml(data: IntentToml): Promise<void> {
    const content = TOML.stringify(data as unknown as TOML.JsonMap);
    await writeFile(this.intentTomlPath(), content);
  }

  async isSessionCollected(sessionId: string): Promise<boolean> {
    const toml = await this.readIntentToml();
    return toml.collect.sessions.includes(sessionId);
  }

  async recordSession(sessionId: string): Promise<void> {
    const toml = await this.readIntentToml();
    if (!toml.collect.sessions.includes(sessionId)) {
      toml.collect.sessions.push(sessionId);
      await this.writeIntentToml(toml);
    }
  }

  async listSteps(): Promise<Step[]> {
    const dir = this.stepsDir();
    if (!existsSync(dir)) return [];

    const entries = await readdir(dir);
    const mdFiles = entries.filter((e) => e.endsWith(".md")).sort();

    const steps: Step[] = [];
    for (const file of mdFiles) {
      try {
        const content = await readFile(join(dir, file), "utf-8");
        steps.push(fromMarkdown(content));
      } catch (e) {
        console.warn(`ステップファイル '${file}' の読み込みに失敗。スキップします: ${e instanceof Error ? e.message : e}`);
      }
    }
    return steps;
  }

  async getStep(number: number): Promise<Step> {
    const path = this.stepPath(number);
    if (!existsSync(path)) {
      throw new Error(
        `ステップ ${String(number).padStart(3, "0")} が見つかりません`
      );
    }
    const content = await readFile(path, "utf-8");
    return fromMarkdown(content);
  }

  async saveStep(step: Step): Promise<void> {
    const path = this.stepPath(step.number);
    await writeFile(path, toMarkdown(step));
  }

  async nextStepNumber(): Promise<number> {
    const steps = await this.listSteps();
    if (steps.length === 0) return 1;
    return steps[steps.length - 1].number + 1;
  }

  async removeStep(number: number): Promise<void> {
    const path = this.stepPath(number);
    if (!existsSync(path)) {
      throw new Error(
        `ステップ ${String(number).padStart(3, "0")} が見つかりません`
      );
    }
    await unlink(path);
  }

  async reset(): Promise<void> {
    const dir = this.stepsDir();
    if (existsSync(dir)) {
      const entries = await readdir(dir);
      const mdFiles = entries.filter((e) => e.endsWith(".md"));
      for (const file of mdFiles) {
        await unlink(join(dir, file));
      }
    }
    const toml = await this.readIntentToml();
    toml.collect.sessions = [];
    await this.writeIntentToml(toml);
  }
}
