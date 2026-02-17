import type { ConversationTurn } from "../domain/session.js";
import type { Step } from "../domain/step.js";

export interface StepDraft {
  title: string;
  prompt: string;
  reasoning: string;
  outcome: string;
  tags?: string[];
  skip?: boolean;
}

export interface Summarizer {
  summarize(
    turns: ConversationTurn[],
    previousSteps: Step[]
  ): Promise<StepDraft | null>;
}
