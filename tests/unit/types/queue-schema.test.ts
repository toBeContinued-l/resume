import { describe, expect, it } from "vitest";
import {
  generationProgressCopy,
  generationTaskMessageSchema
} from "@/types/queue";

describe("queue schemas", () => {
  it("accepts a generation task message", () => {
    expect(
      generationTaskMessageSchema.safeParse({
        taskId: "task-1",
        resumeId: "resume-1",
        userId: "user-1",
        attempt: 0,
        reason: "initial"
      }).success
    ).toBe(true);
  });

  it("has progress copy for public task statuses", () => {
    expect(generationProgressCopy.pending).toBe("已提交，正在排队准备处理");
    expect(generationProgressCopy.completed).toBe("生成完成");
  });
});
