import { z } from "zod";

export const generationTaskStatusSchema = z.enum([
  "pending",
  "parsing",
  "ai_processing",
  "completed",
  "failed",
  "cancelled",
  "cleaned"
]);

export type GenerationTaskStatus = z.infer<typeof generationTaskStatusSchema>;

export const generationTaskMessageSchema = z.object({
  taskId: z.string().min(1),
  resumeId: z.string().min(1),
  userId: z.string().min(1),
  attempt: z.number().int().nonnegative(),
  reason: z.enum(["initial", "retry_parse_empty", "user_retry"])
});

export type GenerationTaskMessage = z.infer<typeof generationTaskMessageSchema>;

export interface GenerationQueue {
  publish(message: GenerationTaskMessage): Promise<void>;
  consume(
    handler: (message: GenerationTaskMessage) => Promise<void>
  ): Promise<void>;
}

export const generationProgressCopy: Record<
  Exclude<GenerationTaskStatus, "cleaned">,
  string
> = {
  pending: "已提交，正在排队准备处理",
  parsing: "正在解析简历文件并提取结构",
  ai_processing: "正在优化内容并生成在线排版",
  completed: "生成完成",
  failed: "生成失败，可以重试或重新上传",
  cancelled: "已终止生成"
};
