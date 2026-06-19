import { ensureGenerationWorkerStarted } from "@/server/generation-worker-runtime";

export async function register() {
  const worker = ensureGenerationWorkerStarted();
  if (worker) {
    await worker;
  }
}
