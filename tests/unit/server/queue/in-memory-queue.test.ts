import { describe, expect, it } from "vitest";
import { InMemoryGenerationQueue } from "@/server/queue";
import type { GenerationTaskMessage } from "@/types/queue";

describe("InMemoryGenerationQueue", () => {
  it("publishes and consumes generation messages in FIFO order", async () => {
    const queue = new InMemoryGenerationQueue();
    const consumed: GenerationTaskMessage[] = [];

    await queue.consume(async (message) => {
      consumed.push(message);
    });

    await queue.publish({
      taskId: "task-1",
      resumeId: "resume-1",
      userId: "user-1",
      attempt: 0,
      reason: "initial",
    });
    await queue.publish({
      taskId: "task-2",
      resumeId: "resume-2",
      userId: "user-1",
      attempt: 0,
      reason: "initial",
    });

    expect(consumed.map((message) => message.taskId)).toEqual(["task-1", "task-2"]);
    expect(queue.ackedMessages.map((message) => message.taskId)).toEqual(["task-1", "task-2"]);
    expect(queue.queuedCount).toBe(0);
  });

  it("validates messages before enqueueing", async () => {
    const queue = new InMemoryGenerationQueue();

    await expect(
      queue.publish({
        taskId: "task-1",
        resumeId: "resume-1",
        userId: "user-1",
        attempt: -1,
        reason: "initial",
      }),
    ).rejects.toThrow();
  });
});
