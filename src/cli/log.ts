import { FileSystemRepository } from "../adapter/filesystem-repository.js";

export async function logCommand(): Promise<void> {
  const repo = FileSystemRepository.create();
  const steps = await repo.listSteps();

  if (steps.length === 0) {
    console.log(
      "ステップがありません。`intent collect` で収集してください。"
    );
    return;
  }

  for (const step of steps) {
    const date = step.timestamp.toISOString().slice(0, 10);
    const num = String(step.number).padStart(3, "0");
    console.log(`  ${num}  ${date}  ${step.title}`);
  }
}
