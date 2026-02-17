import type { Step } from "../domain/step.js";

export interface StepRepository {
  listSteps(): Promise<Step[]>;
  getStep(number: number): Promise<Step>;
  saveStep(step: Step): Promise<void>;
  nextStepNumber(): Promise<number>;
}
