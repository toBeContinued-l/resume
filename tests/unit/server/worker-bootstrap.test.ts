import { afterEach, describe, expect, it, vi } from "vitest";

const startGenerationWorker = vi.fn(async () => undefined);

vi.mock("@/worker", () => ({
  startGenerationWorker,
}));

describe("generation worker bootstrap", () => {
  afterEach(async () => {
    startGenerationWorker.mockClear();
    vi.resetModules();
    vi.unstubAllEnvs();
    const { resetGenerationWorkerForTest } = await import("@/server/generation-worker-runtime");
    resetGenerationWorkerForTest();
  });

  it("starts the worker at most once per process", async () => {
    vi.stubEnv("ENABLE_GENERATION_WORKER", "1");

    const { ensureGenerationWorkerStarted } = await import("@/server/generation-worker-runtime");
    const first = ensureGenerationWorkerStarted();
    const second = ensureGenerationWorkerStarted();

    expect(first).toBeTruthy();
    expect(second).toBe(first);
    await first;
    expect(startGenerationWorker).toHaveBeenCalledTimes(1);
  });

  it("skips worker startup when explicitly disabled", async () => {
    vi.stubEnv("ENABLE_GENERATION_WORKER", "0");

    const { ensureGenerationWorkerStarted } = await import("@/server/generation-worker-runtime");

    expect(ensureGenerationWorkerStarted()).toBeNull();
    expect(startGenerationWorker).not.toHaveBeenCalled();
  });
});
