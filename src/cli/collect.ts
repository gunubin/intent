import { ClaudeCodeLogReader } from "../adapter/claude-code-log-reader.js";
import { ClaudeCodeSummarizer } from "../adapter/claude-code-summarizer.js";
import { FileSystemRepository } from "../adapter/filesystem-repository.js";
import { PrivacyFilter } from "../adapter/privacy-filter.js";
import { CollectUseCase } from "../usecase/collect.js";

export async function collectCommand(session?: string): Promise<void> {
  const reader = ClaudeCodeLogReader.create();
  const summarizer = new ClaudeCodeSummarizer();
  const filter = await PrivacyFilter.fromConfig();
  const repository = FileSystemRepository.create();

  const usecase = new CollectUseCase(reader, summarizer, filter, repository);

  if (session) {
    await usecase.collectSession(session);
  } else {
    await usecase.collectAll();
  }
}
