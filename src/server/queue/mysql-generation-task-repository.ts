import type { GenerationTaskStatus } from "@/types/queue";
import type { CreateGenerationTaskInput, GenerationTaskRecord, GenerationTaskRepository } from "./types";
import type { SourceFileType } from "../resume/types";
import type { SqlExecutor } from "../db/mysql-client";
import { firstOrNull, nullableDate, toDate } from "../db/mysql-client";

type TaskRow = {
  id: string;
  user_id: string;
  resume_id: string;
  file_type: SourceFileType;
  file_size: number;
  temp_file_path: string;
  status: GenerationTaskStatus;
  retry_count: number;
  error_code: string | null;
  error_message: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  completed_at: Date | string | null;
  is_deleted: boolean | number;
  deleted_at: Date | string | null;
};

export class MysqlGenerationTaskRepository implements GenerationTaskRepository {
  constructor(
    private readonly db: SqlExecutor,
    private readonly now: () => Date = () => new Date(),
  ) {}

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
    await this.db.execute(
      "insert into generation_tasks (id, user_id, resume_id, file_type, file_size, temp_file_path, status, retry_count, error_code, error_message, created_at, updated_at, completed_at, is_deleted, deleted_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [task.id, task.userId, task.resumeId, task.fileType, task.fileSize, task.tempFilePath, task.status, task.retryCount, task.errorCode, task.errorMessage, task.createdAt, task.updatedAt, task.completedAt, task.isDeleted, task.deletedAt],
    );
    return task;
  }

  async findTaskById(taskId: string): Promise<GenerationTaskRecord | null> {
    return mapTask(
      firstOrNull(await this.db.execute<TaskRow>("select * from generation_tasks where id = ? and is_deleted = false limit 1", [taskId])),
    );
  }

  async updateTask(task: GenerationTaskRecord): Promise<GenerationTaskRecord> {
    const updatedAt = this.now();
    await this.db.execute(
      "update generation_tasks set status = ?, retry_count = ?, error_code = ?, error_message = ?, is_deleted = ?, updated_at = ?, completed_at = ?, deleted_at = ? where id = ?",
      [task.status, task.retryCount, task.errorCode, task.errorMessage, task.isDeleted, updatedAt, task.completedAt, task.deletedAt, task.id],
    );
    return { ...task, updatedAt };
  }

  async deleteTask(taskId: string): Promise<void> {
    const now = this.now();
    await this.db.execute(
      "update generation_tasks set is_deleted = true, updated_at = ?, deleted_at = coalesce(deleted_at, ?) where id = ? and is_deleted = false",
      [now, now, taskId],
    );
  }
}

function mapTask(row: TaskRow | null): GenerationTaskRecord | null {
  return row
    ? {
        id: row.id,
        userId: row.user_id,
        resumeId: row.resume_id,
        fileType: row.file_type,
        fileSize: row.file_size,
        tempFilePath: row.temp_file_path,
        status: row.status,
        retryCount: row.retry_count,
        errorCode: row.error_code,
        errorMessage: row.error_message,
        createdAt: toDate(row.created_at),
        updatedAt: toDate(row.updated_at),
        completedAt: nullableDate(row.completed_at),
        isDeleted: Boolean(row.is_deleted),
        deletedAt: nullableDate(row.deleted_at),
      }
    : null;
}
