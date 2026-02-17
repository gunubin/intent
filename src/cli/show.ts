import { FileSystemRepository } from "../adapter/filesystem-repository.js";

export async function showCommand(stepNumber: number): Promise<void> {
  const repo = FileSystemRepository.create();
  const step = await repo.getStep(stepNumber);

  const num = String(step.number).padStart(3, "0");
  const ts = step.timestamp.toISOString().replace(/\.\d{3}Z$/, "Z");

  console.log(`# Step ${num}: ${step.title}`);
  console.log(`session: ${step.session}`);
  console.log(`timestamp: ${ts}`);
  if (step.tags.length > 0) {
    console.log(`tags: ${step.tags.join(", ")}`);
  }
  if (step.relatedSteps.length > 0) {
    console.log(`related: ${step.relatedSteps.map((n) => String(n).padStart(3, "0")).join(", ")}`);
  }
  console.log();
  console.log(`## prompt\n\n${step.prompt}`);
  console.log(`\n## reasoning\n\n${step.reasoning}`);
  console.log(`\n## outcome\n\n${step.outcome}`);
  if (step.friction) {
    console.log(`\n## friction\n\n${step.friction}`);
  }
}
