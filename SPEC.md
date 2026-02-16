# intent — 意図のバージョン管理CLI

## Why

vibe codingで「何を作ったか」は共有できる（GitHub）。でも「なぜその形になったか」の試行錯誤は消える。

- claude-panesを20セッションかけて作った過程で「tui-rsは非推奨だった」「CPU使用率だけだとアイドル誤検知する」等の学びがあった
- これらはコードを読んでも見えない。コミットメッセージにも残らない
- 次に似たものを作る人は同じ壁にぶつかる
- AIに「TUI作って」と投げても、この摩擦の知識はAIにもない

**核心: vibe coding時代、コードの価値は下がったが、試行錯誤の過程の価値は上がっている。それなのに記録・共有する手段がない。**

## What

AIとの対話ログから意図の進化過程を抽出・構造化・共有するCLIツール。

記録するもの:
- prompt — 何を指示したか
- reasoning — なぜこの実装になったか
- outcome — 何ができるようになったか
- friction — 想定外だったこと（手動追記、任意）

## ターゲットユーザー

| Phase | ターゲット | 動機 |
|---|---|---|
| 1 | 自分（個人vibe coder） | 自分のOSSに.intentを追加して検証 |
| 2 | 個人開発者 | CLIを公開、使ってもらう |
| 3 | OSSメンテナ | 設計意図の共有でIssue対応削減 |
| 4 | 学習者 | 他人のvibe codingの過程から学ぶ |

企業/チーム向け（entire.io領域）は意図的にスキップ。

## 競合との違い

| | entire.io | intent |
|---|---|---|
| 記録対象 | AI文脈（1回のやりとり） | 意図の進化過程（プロジェクト全体） |
| 視点 | コードの「なぜ」 | プロダクトの「なぜこの形になったか」 |
| 価値 | デバッグ・引き継ぎ | 学び・再利用・共感 |
| ターゲット | チーム・企業 | 個人開発者・OSS |

## 技術スタック

- Rust
- クリーンアーキテクチャ
- Claude Codeのログ読み取りはPhase 1で実装（マスト）
- 他エージェント（Cursor等）は将来対応
- AgentLogReaderをtraitで抽象化し、後から追加可能な設計にする

## アーキテクチャ

### レイヤー構成

```
Domain層:       Step, Project, SessionLog（エンティティ）
UseCase層:      Collect, Regroup, Summarize, Filter
Port（trait）:  AgentLogReader, Summarizer, StepRepository
Adapter層:      ClaudeCodeLogReader, CursorLogReader, ClaudeAPISummarizer, RuleBasedSummarizer, FileSystemRepository
CLI層:          clap によるコマンド定義
```

### 抽象化ポイント

AgentLogReaderトレイト:
- ClaudeCodeLogReader — ~/.claude/projects/ のJSONLを読む（Phase 1で実装）
- CursorLogReader — 将来対応
- その他エージェント — 将来対応

Summarizerトレイト:
- ClaudeCodeSummarizer — Claude Codeに要約を依頼（優先）
- ClaudeAPISummarizer — API直接呼び出し（API key設定済みなら）
- RuleBasedSummarizer — thinkingの最初の文 + 最後のtextを機械的に抜く（フォールバック）

## .intent/ フォーマット

```
.intent/
├── intent.toml       # プロジェクトメタデータ
├── config.toml       # フィルタリング設定
└── steps/
    ├── 001.md        # ステップ1
    ├── 002.md        # ステップ2
    └── ...
```

### intent.toml

```toml
[project]
name = "claude-panes"
description = "tmuxのペイン状態を一覧表示するTUI"
origin = "https://github.com/gunubin/claude-panes"
author = "gunubin"
forked_from = ""
forked_at_step = 0

[source]
tool = "claude-code"
version = "2.1.42"
model = "claude-opus-4-6"

[collect]
sessions = [
  "0179d9ad-0c57-4d8d-89a8-5d3355be15e3",
  "a30c9e90-db6a-4456-b17d-e8acb9215871",
]
```

### steps/001.md

```markdown
---
step: 1
title: "ペイン一覧のTUI表示"
session: "a30c9e90-db6a-4456-b17d-e8acb9215871"
timestamp: 2026-02-10T14:30:00Z
tags: [core, tui]
---

## prompt

tmuxのペインをリスト表示するTUIを作って。
ratatuiとcrosstermで実装。

## reasoning

ratatui v0.29 + crossterm v0.28を選択。
Table widgetでペイン一覧を表示し、
状態はUnicodeシンボルで区別する設計。

## outcome

基本的なTUI表示が動作。

## friction

最初はtui-rsを使おうとしたが非推奨だった。
```

### config.toml（プライバシーフィルタ）

```toml
[filter]
exclude_patterns = [
  "(?i)(api.?key|token|secret|password)",
  "^(はい|ok|yes|y|n|no)$",
  "戻して|取り消し|やっぱ",
]
exclude_tool_results = true
min_prompt_length = 20
```

## CLIコマンド

### Phase 1（自分で使う）

```
intent init                          # .intent/ を初期化
intent collect                       # ログから自動抽出・グルーピング提案
intent collect --session <id>        # 特定セッションだけ収集
intent regroup <step> --into <step>  # ステップを統合
intent edit <step>                   # frictionなどを手動編集
intent log                           # ステップ一覧を表示
intent show <step>                   # 特定ステップの詳細表示
```

### Phase 2（公開・取得）

```
intent push                          # git add .intent/ && commit && push
intent pull <user/repo>              # .intent/ だけ取得して閲覧
intent fork <user/repo> --from <step># 指定ステップから分岐
intent diff <user/repo>              # 意図の差分表示
```

### Phase 3（発見）

```
intent search <keyword>              # .intent/を持つリポジトリを検索
```

## 自動収集フロー（git hook方式）

```
git push
  ↓
pre-push hook → intent auto-collect
  ↓
1. 前回collectからのgit差分を検出
2. 差分に関連するセッションのプロンプトを抽出
3. 自動フィルタリング（秘密情報・短文・取消系を除外）
4. Claude Codeに要約依頼 → reasoning/outcome生成
5. レビュー画面（TUI）で確認
6. 確定 → .intent/steps/NNN.md を生成・コミット
7. push続行
```

## セッションのグルーピング

Claude Codeは並行開発するため1日20セッション等になる。時系列では意味をなさない。

方式: 自動クラスタリング + 手動調整
- AIがプロンプト内容を分析して自動グルーピング
- `intent regroup` で手動調整

## AI要約の方法

優先順位:
1. Claude Code経由で要約（セッション内コンテキストが豊富、追加コスト無し）
2. Claude API呼び出し（API key設定済みなら）
3. ルールベース抽出（thinkingの最初の文 + 最後のtext）

## プライバシー対策

- auto + review方式: 自動収集 → push前にTUIレビュー画面
- 自動フィルタリング: 秘密情報パターン、短文、取消系を除外
- レビューで [q] 押せばintent無しでpush可能
- opt-outではなくreview必須で事故を防ぐ

## 参考リンク

- [entire.io](https://entire.io/) — Nat Friedman（元GitHub CEO）のコード+文脈プラットフォーム
- [GitHub Spec Kit](https://github.com/github/spec-kit) — Spec-Driven Development toolkit
- [Augment Code Intent](https://www.augmentcode.com/product/intent) — living specワークスペース

## 将来の展望: プロンプトの形式化

intentのログが蓄積されると、プロンプトのパターンが可視化される。

```
Phase 1: 意図を記録する（intent）
Phase 2: 意図のパターンが見える（集計）
Phase 3: 意図が形式化される（スキルの標準化）
Phase 4: 形式化された意図 = 新しいプログラミング言語
```

- よく使われるパターンに名前がつく（デザインパターンの再来）
- 信頼度スコアが高いプロンプトが「ライブラリ」になる
- `intent fork` で良いプロンプトを継承して改良する
- 抽象化のレイヤーが1段上がるだけで、やってることはソフトウェア工学と同じ構造

プロンプトが「自然言語で書くコード」になり、intentがそのバージョン管理になる。
