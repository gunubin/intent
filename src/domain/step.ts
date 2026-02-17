export interface Step {
  number: number;
  title: string;
  session: string;
  timestamp: Date;
  tags: string[];
  prompt: string;
  reasoning: string;
  outcome: string;
  friction: string;
}

export function toMarkdown(step: Step): string {
  const tagsStr =
    step.tags.length === 0 ? "[]" : `[${step.tags.join(", ")}]`;

  const ts = step.timestamp.toISOString().replace(/\.\d{3}Z$/, "Z");

  let md = `---
step: ${step.number}
title: "${step.title}"
session: "${step.session}"
timestamp: ${ts}
tags: ${tagsStr}
---

## prompt

${step.prompt}

## reasoning

${step.reasoning}

## outcome

${step.outcome}`;

  if (step.friction) {
    md += `\n\n## friction\n\n${step.friction}`;
  }

  md += "\n";
  return md;
}

export function fromMarkdown(content: string): Step {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) {
    throw new Error("frontmatterが見つかりません");
  }

  const rest = trimmed.slice(3);
  const endIdx = rest.indexOf("---");
  if (endIdx === -1) {
    throw new Error("frontmatterの終了が見つかりません");
  }

  const frontmatter = rest.slice(0, endIdx).trim();
  const body = rest.slice(endIdx + 3).trim();

  const number = parseInt(extractField(frontmatter, "step"), 10);
  if (isNaN(number)) throw new Error("step番号のパースに失敗");

  const title = extractField(frontmatter, "title");
  const session = extractField(frontmatter, "session");
  const timestampStr = extractField(frontmatter, "timestamp");
  const timestamp = new Date(timestampStr);
  if (isNaN(timestamp.getTime())) {
    throw new Error(`timestampのパースに失敗: ${timestampStr}`);
  }

  const tagsStr = extractFieldOptional(frontmatter, "tags") ?? "[]";
  const tags = parseTags(tagsStr);

  return {
    number,
    title,
    session,
    timestamp,
    tags,
    prompt: extractSection(body, "prompt"),
    reasoning: extractSection(body, "reasoning"),
    outcome: extractSection(body, "outcome"),
    friction: extractSection(body, "friction"),
  };
}

function extractField(frontmatter: string, key: string): string {
  for (const line of frontmatter.split("\n")) {
    if (line.startsWith(`${key}:`)) {
      const val = line.slice(key.length + 1).trim();
      return val.replace(/^"|"$/g, "");
    }
  }
  throw new Error(`フィールド '${key}' が見つかりません`);
}

function extractFieldOptional(
  frontmatter: string,
  key: string
): string | undefined {
  try {
    return extractField(frontmatter, key);
  } catch {
    return undefined;
  }
}

function parseTags(s: string): string[] {
  const inner = s.trim().replace(/^\[/, "").replace(/\]$/, "");
  if (!inner) return [];
  return inner.split(",").map((t) => t.trim());
}

function extractSection(body: string, section: string): string {
  const header = `## ${section}`;
  const start = body.indexOf(header);
  if (start === -1) return "";

  const afterHeader = body.slice(start + header.length);
  const end = afterHeader.indexOf("\n## ");
  const content = end === -1 ? afterHeader : afterHeader.slice(0, end);
  return content.trim();
}
