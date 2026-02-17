import { z } from "zod/v4";

const ContentBlockText = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const ContentBlockThinking = z.object({
  type: z.literal("thinking"),
  thinking: z.string(),
});

const ContentBlockToolUse = z.object({
  type: z.literal("tool_use"),
  name: z.string(),
  input: z.unknown(),
});

const ContentBlockToolResult = z.object({
  type: z.literal("tool_result"),
  content: z.unknown().optional(),
});

const ContentBlock = z.union([
  ContentBlockText,
  ContentBlockThinking,
  ContentBlockToolUse,
  ContentBlockToolResult,
  z.object({ type: z.string() }), // Other
]);

const MessageContent = z.union([z.string(), z.array(ContentBlock)]);

const Message = z.object({
  role: z.string(),
  content: MessageContent,
});

export const SessionEntry = z.object({
  type: z.string(),
  isSidechain: z.boolean().optional(),
  message: Message.optional(),
});

export type SessionEntry = z.infer<typeof SessionEntry>;
export type ContentBlock = z.infer<typeof ContentBlock>;

export interface ConversationTurn {
  userPrompt: string;
  assistantThinking: string[];
  assistantText: string[];
  toolUses: string[];
  toolResults: string[];
  skills: string[];
}

export function summaryContext(turn: ConversationTurn): string {
  let ctx = `## ユーザーの指示\n${turn.userPrompt}\n`;
  if (turn.assistantThinking.length > 0) {
    ctx += `\n## AIの思考\n${turn.assistantThinking.join("\n")}\n`;
  }
  if (turn.assistantText.length > 0) {
    ctx += `\n## AIの応答\n${turn.assistantText.join("\n")}\n`;
  }
  if (turn.toolUses.length > 0) {
    ctx += `\n## 使用ツール\n${turn.toolUses.join(", ")}\n`;
  }
  return ctx;
}
