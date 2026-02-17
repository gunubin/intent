# プラン実行セッションからの意図抽出

## Context

`intent collect` で claude-panes プロジェクトを収集すると、22セッション中 3つしか収集されない。調査の結果、17セッションが `Implement the following plan:` で始まるプラン実行セッションで、`collect.ts:65` で一律スキップされていた。プラン本文には `# タイトル` + `## Context` で構造化されたユーザー意図が含まれており、これを抽出すべき。

## 変更

### 1. `src/usecase/collect.ts` — プラン実行セッションの処理

`parsePlanText()` ヘルパーを追加し、スキップの代わりに意図を抽出する。

**現在 (65-69行目):**
```typescript
if (turns[0].userPrompt.startsWith("Implement the following plan:")) {
  // skip
}
```

**変更後:**
```typescript
const planDraft = parsePlanText(turns[0].userPrompt);
if (planDraft) {
  // planDraft を使って Step を直接生成（summarizer 不要）
}
```

`parsePlanText(prompt: string): StepDraft | null`:
- `Implement the following plan:` プレフィックスを除去
- `# タイトル` → `title`（30文字以内に切詰め）
- `## Context` セクション → `prompt`
- 変更セクションのファイル一覧 → `reasoning`（簡潔に）
- タイトル + 実装完了 → `outcome`
- タグ: `["plan"]`
- Context が抽出できない場合は `null` を返し、通常フローにフォールバック

### 2. `src/adapter/claude-code-summarizer.ts` — プロンプト修正

`SUMMARIZE_PROMPT` の skip 指示から `"Implement the following plan:" 等` の記述を削除。collect.ts 側で処理済みのため不要。

### 3. テスト追加

`src/usecase/__tests__/collect.test.ts` を新規作成:
- `parsePlanText()` が正しくタイトル・Context を抽出するテスト
- Context なしのプランで `null` を返すテスト
- 長いタイトルが30文字に切詰められるテスト

## 検証

```bash
npm run build && npm test
```

```bash
cd /Users/koki/works/gunubin/claude-panes
intent reset --yes && intent collect
```

期待: 17 プラン実行 + 3 ユーザー直接 = 20セッション収集（2つの空セッションのみスキップ）
