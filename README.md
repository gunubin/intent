# intent

[![CI](https://github.com/gunubin/intent/actions/workflows/ci.yml/badge.svg)](https://github.com/gunubin/intent/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/intent-log)](https://www.npmjs.com/package/intent-log)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)

**Code is disposable. Intent is the asset.**

AI generates code. You can regenerate it anytime. What you can't regenerate is the sequence of decisions that shaped the software — the problems you identified, the constraints you set, the directions you chose. `intent` captures that sequence from your AI coding sessions and turns it into a reproducible, reviewable history.

## The problem

When you build with AI agents, your codebase changes fast. But the *why* behind each change gets lost in chat logs. A month later, you open the project and ask yourself: "Why did I build it this way?"

Git log shows *what* changed. Commit messages try to explain *why*. But the real story — the trial-and-error, the constraints, the rejected approaches — lives in your conversation with the AI. And that conversation disappears when the session ends.

## What intent does

`intent` reads your Claude Code session logs and extracts a structured timeline of human decisions.

```
$ intent log
  001  2026-02-15  認証機能の追加
  002  2026-02-15  ログインバグの修正
  003  2026-02-16  /commit スキル実行
```

Each step captures:

- **prompt** — what you asked the AI to do
- **reasoning** — why you chose this approach
- **outcome** — what was achieved
- **friction** — what went wrong along the way

## Why this matters

### Reproducibility

A prompt history is a recipe. If you have the full sequence of intents that built a piece of software, you (or someone else) can rebuild it — or build a better version by tweaking specific steps.

### Trust signal

Software built through structured flows (plans, tested skills, slash commands) is more reliable than software built through free-form conversation. `intent` makes that distinction visible:

```
  001  2026-02-15  認証機能の追加              [plan]
  002  2026-02-15  /commit スキル実行          [skill]
  003  2026-02-16  パフォーマンス改善          [feature]
```

Steps tagged `[plan]` or `[skill]` were executed through structured, repeatable processes. This is a quality signal.

### Team context

When someone joins a project, they don't just need the code — they need to understand the decisions behind it. `intent` gives them a readable timeline of why the software evolved the way it did.

## Quick start

```bash
npm install -g intent-log

cd your-project
intent init
intent collect
intent log
```

### Requirements

- Node.js 22+
- Claude Code CLI installed and authenticated

## Commands

| Command | Description |
|---|---|
| `intent init` | Initialize `.intent/` in your project |
| `intent collect` | Extract intent from Claude Code session logs |
| `intent log` | Show the timeline of intent steps |
| `intent show <step>` | View details of a specific step |
| `intent replay` | Export prompt history in a reproducible format |
| `intent rm <step>` | Remove a step |
| `intent reset` | Clear all collected steps |

## How it works

1. You work with Claude Code as usual
2. `intent collect` reads the session logs from `~/.claude/projects/`
3. Each session is analyzed:
   - **Plan executions** are parsed directly from the plan markdown (no AI call needed)
   - **Skill/slash command sessions** are auto-detected and tagged
   - **Regular conversations** are summarized via Claude to extract the human intent
4. Privacy filter removes sensitive data (API keys, tokens, short/trivial prompts)
5. Results are stored as numbered markdown steps in `.intent/steps/`

## Replay

Export your intent history as a readable, reproducible document:

```bash
# Output to stdout
intent replay

# Save to file
intent replay -o replay.md

# Specific range
intent replay --from 3 --to 10
```

The output contains each step's prompt, reasoning, and outcome — everything needed to understand or reproduce the development process.

## Step format

Each step is stored as a markdown file with frontmatter:

```markdown
---
step: 1
title: "認証機能の追加"
session: "e527b849-..."
timestamp: 2026-02-15T10:30:00Z
tags: [plan]
---

## prompt

ログイン機能を追加。OAuth2対応で、Google/GitHubをサポート。

## reasoning

既存のセッション管理を活かしつつ、OAuth2プロバイダを抽象化して追加しやすくした。

## outcome

Google/GitHubログインが動作。プロバイダ追加はadapter実装のみで可能。

## friction

GitHub OAuthのcallback URLがlocalhostで動かず、ngrokで回避。
```

## Privacy

`intent` never sends raw session logs to external services. The privacy filter runs locally before any summarization:

- API keys, tokens, and secrets are stripped by regex patterns
- Short/trivial prompts (< 20 chars) are excluded
- Agent system instructions are filtered out
- Custom patterns can be added in `.intent/config.toml`

```toml
[filter]
exclude_patterns = [
  "(?i)(api.?key|token|secret|password)",
  "^(はい|ok|yes|y|n|no)$",
]
min_prompt_length = 20
```

## Roadmap

- [ ] **Friction auto-extraction** — Detect errors, retries, and failed tool uses to populate friction automatically
- [ ] **Step dependencies** — Track relationships between steps (e.g., "Step 5 was a bugfix for Step 3")
- [ ] **Trust scoring** — Score each step based on how it was created (plan > skill > free conversation)
- [ ] **`intent diff`** — Compare intent history between two projects or branches
- [ ] **`intent fork`** — Import someone's intent history and replay it in your environment
- [ ] **Multi-agent support** — Cursor, Windsurf, and other AI coding tools

## License

MIT
