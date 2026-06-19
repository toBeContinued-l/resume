import type {
  CreateGenerationTaskInput,
  GenerationTaskRecord,
  GenerationTaskRepository,
} from "./types";

export class InMemoryGenerationTaskRepository implements GenerationTaskRepository {
  readonly tasks = new Map<string, GenerationTaskRecord>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async createTask(input: CreateGenerationTaskInput): Promise<GenerationTaskRecord> {
    const createdAt = this.now();
    const task: GenerationTaskRecord = {
      ...input,
      status: "pending",
      retryCount: 0,
      errorCode: null,
      errorMessage: null,
      createdAt,
      updatedAt: createdAt,
      completedAt: null,
      isDeleted: false,
      deletedAt: null,
    };
    this.tasks.set(task.id, task);
    return task;
  }

  async findTaskById(taskId: string): Promise<GenerationTaskRecord | null> {
    const task = this.tasks.get(taskId);
    return task && !task.isDeleted ? task : null;
  }

  async updateTask(task: GenerationTaskRecord): Promise<GenerationTaskRecord> {
    const updated = { ...task, updatedAt: this.now() };
    this.tasks.set(updated.id, updated);
    return updated;
  }

  async deleteTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task || task.isDeleted) {
      return;
    }
    this.tasks.set(taskId, {
      ...task,
      isDeleted: true,
      deletedAt: this.now(),
      updatedAt: this.now(),
    });
  }
}
