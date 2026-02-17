# intent

[![CI](https://github.com/gunubin/intent/actions/workflows/ci.yml/badge.svg)](https://github.com/gunubin/intent/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/intent-log)](https://www.npmjs.com/package/intent-log)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)

**Version control for intent, not just code.**

When you build software with AI agents, your codebase changes fast — but the *why* behind each change gets lost in chat logs. `intent` extracts the human intent from your AI coding sessions and turns it into a readable, reviewable history.

## Why

Code diffs show *what* changed. Commit messages try to explain *why*. But when you're vibe-coding with AI, the real story lives in your conversation — the problem you described, the direction you chose, the constraints you set.

`intent` captures that story automatically. It reads your Claude Code session logs, extracts the human decisions, and produces a structured timeline of intent. Think of it as `git log` for your thinking.

## What it does

- **Collects** intent from Claude Code session logs — including plan executions and slash command runs
- **Summarizes** each session into a structured step: what you asked, why, and what was achieved
- **Tracks** the evolution of your project through human decisions, not just code changes

## Quick start

```bash
npm install -g intent-log

cd your-project
intent init
intent collect
intent log
```

## Commands

| Command | Description |
|---|---|
| `intent init` | Initialize `.intent/` in your project |
| `intent collect` | Extract intent from Claude Code session logs |
| `intent log` | Show the timeline of intent steps |
| `intent show <step>` | View details of a specific step |
| `intent rm <step>` | Remove a step |
| `intent reset` | Clear all collected steps |

## How it works

1. You work with Claude Code as usual
2. `intent collect` reads the session logs from `~/.claude/projects/`
3. Each session is analyzed — plan executions are parsed directly, regular sessions are summarized via Claude
4. The result is a series of numbered steps stored in `.intent/steps/`

## Example output

```
$ intent log
001  feat: 認証機能の追加          [feature]     2025-01-15
002  fix: ログインバグの修正        [bugfix]      2025-01-15
003  /commit スキル実行             [skill]       2025-01-16
```

## License

MIT
