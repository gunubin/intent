import type { ConversationTurn } from "../domain/session.js";

export interface AgentLogReader {
  listSessions(): Promise<string[]>;
  readSession(sessionId: string): Promise<ConversationTurn[]>;
  getSessionTimestamp(sessionId: string): Promise<Date>;
}
