#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./cli/init.js";
import { collectCommand } from "./cli/collect.js";
import { logCommand } from "./cli/log.js";
import { showCommand } from "./cli/show.js";
import { resetCommand } from "./cli/reset.js";
import { rmCommand } from "./cli/rm.js";

const program = new Command();

program
  .name("intent")
  .description("意図のバージョン管理CLI — AIとの対話ログから意図の進化過程を抽出・構造化")
  .version("0.2.0");

program
  .command("init")
  .description(".intent/ を初期化")
  .action(async () => {
    try {
      await initCommand();
    } catch (e) {
      console.error(`エラー: ${e instanceof Error ? e.message : e}`);
      process.exit(1);
    }
  });

program
  .command("collect")
  .description("ログから意図を収集")
  .option("--session <id>", "特定セッションだけ収集")
  .action(async (opts: { session?: string }) => {
    try {
      await collectCommand(opts.session);
    } catch (e) {
      console.error(`エラー: ${e instanceof Error ? e.message : e}`);
      process.exit(1);
    }
  });

program
  .command("log")
  .description("ステップ一覧を表示")
  .action(async () => {
    try {
      await logCommand();
    } catch (e) {
      console.error(`エラー: ${e instanceof Error ? e.message : e}`);
      process.exit(1);
    }
  });

program
  .command("show")
  .description("特定ステップの詳細表示")
  .argument("<step>", "ステップ番号")
  .action(async (step: string) => {
    try {
      const num = parseInt(step, 10);
      if (isNaN(num)) {
        console.error("エラー: ステップ番号は数値で指定してください");
        process.exit(1);
      }
      await showCommand(num);
    } catch (e) {
      console.error(`エラー: ${e instanceof Error ? e.message : e}`);
      process.exit(1);
    }
  });

program
  .command("reset")
  .description("すべてのステップとセッション履歴をリセット")
  .option("--yes", "確認プロンプトをスキップ")
  .action(async (opts: { yes?: boolean }) => {
    try {
      if (!opts.yes) {
        const { createInterface } = await import("node:readline");
        const rl = createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        const answer = await new Promise<string>((resolve) => {
          rl.question(
            "すべてのステップとセッション履歴を削除します。よろしいですか？ (y/N) ",
            resolve
          );
        });
        rl.close();
        if (answer.toLowerCase() !== "y") {
          console.log("キャンセルしました。");
          return;
        }
      }
      await resetCommand();
    } catch (e) {
      console.error(`エラー: ${e instanceof Error ? e.message : e}`);
      process.exit(1);
    }
  });

program
  .command("rm")
  .description("特定のステップを削除")
  .argument("<step>", "ステップ番号")
  .action(async (step: string) => {
    try {
      const num = parseInt(step, 10);
      if (isNaN(num)) {
        console.error("エラー: ステップ番号は数値で指定してください");
        process.exit(1);
      }
      await rmCommand(num);
    } catch (e) {
      console.error(`エラー: ${e instanceof Error ? e.message : e}`);
      process.exit(1);
    }
  });

program.parse();
