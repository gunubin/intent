import { FileSystemRepository } from "../adapter/filesystem-repository.js";

export async function resetCommand(): Promise<void> {
  const repo = FileSystemRepository.create();
  await repo.reset();
  console.log("すべてのステップとセッション履歴をリセットしました。");
}
