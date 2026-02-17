import { FileSystemRepository } from "../adapter/filesystem-repository.js";

export async function rmCommand(stepNumber: number): Promise<void> {
  const repo = FileSystemRepository.create();
  await repo.removeStep(stepNumber);
  console.log(
    `ステップ ${String(stepNumber).padStart(3, "0")} を削除しました。`
  );
}
