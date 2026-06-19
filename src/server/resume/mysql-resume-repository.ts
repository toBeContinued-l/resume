import { randomUUID } from "crypto";
import type { ResumeContent, ResumeLayout } from "@/types/resume";
import type {
  ResumeContentRecord,
  ResumeLinkRecord,
  ResumeRecord,
  ResumeRepository,
} from "./types";
import type { SqlExecutor } from "../db/mysql-client";
import { firstOrNull, fromMysqlJson, nullableDate, toDate, toMysqlJson } from "../db/mysql-client";

type ResumeRow = {
  id: string;
  user_id: string;
  title: string;
  status: ResumeRecord["status"];
  source_file_name: string | null;
  source_file_type: ResumeRecord["sourceFileType"];
  source_file_size: number | null;
  current_task_id: string | null;
  is_deleted: boolean | number;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
};

type ContentRow = {
  id: string;
  resume_id: string;
  content_json: unknown;
  layout_json: unknown;
  created_at: Date | string;
  updated_at: Date | string;
  is_deleted: boolean | number;
  deleted_at: Date | string | null;
};

type LinkRow = {
  id: string;
  resume_id: string;
  slug: string;
  access_mode: ResumeLinkRecord["accessMode"];
  password_hash: string | null;
  is_active: boolean | number;
  created_at: Date | string;
  updated_at: Date | string;
  is_deleted: boolean | number;
  deleted_at: Date | string | null;
};

export class MysqlResumeRepository implements ResumeRepository {
  constructor(
    private readonly db: SqlExecutor,
    private readonly options: { now?: () => Date; createId?: () => string } = {},
  ) {}

  async createResume(input: Omit<ResumeRecord, "createdAt" | "updatedAt" | "deletedAt" | "isDeleted">): Promise<ResumeRecord> {
    const createdAt = this.now();
    await this.db.execute(
      "insert into resumes (id, user_id, title, status, source_file_name, source_file_type, source_file_size, current_task_id, is_deleted, created_at, updated_at, deleted_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [input.id, input.userId, input.title, input.status, input.sourceFileName, input.sourceFileType, input.sourceFileSize, input.currentTaskId, false, createdAt, createdAt, null],
    );
    return { ...input, isDeleted: false, createdAt, updatedAt: createdAt, deletedAt: null };
  }

  async findResumeById(resumeId: string): Promise<ResumeRecord | null> {
    return mapResume(firstOrNull(await this.db.execute<ResumeRow>("select * from resumes where id = ? limit 1", [resumeId])));
  }

  async updateResume(resume: ResumeRecord): Promise<ResumeRecord> {
    const updatedAt = this.now();
    await this.db.execute(
      "update resumes set title = ?, status = ?, source_file_name = ?, source_file_type = ?, source_file_size = ?, current_task_id = ?, is_deleted = ?, updated_at = ?, deleted_at = ? where id = ?",
      [resume.title, resume.status, resume.sourceFileName, resume.sourceFileType, resume.sourceFileSize, resume.currentTaskId, resume.isDeleted, updatedAt, resume.deletedAt, resume.id],
    );
    return { ...resume, updatedAt };
  }

  async deleteResume(resumeId: string): Promise<void> {
    const now = this.now();
    await this.db.execute(
      "update resume_links set is_active = false, is_deleted = true, updated_at = ?, deleted_at = coalesce(deleted_at, ?) where resume_id = ? and is_deleted = false",
      [now, now, resumeId],
    );
    await this.db.execute(
      "update resume_contents set is_deleted = true, updated_at = ?, deleted_at = coalesce(deleted_at, ?) where resume_id = ? and is_deleted = false",
      [now, now, resumeId],
    );
    await this.db.execute(
      "update resumes set status = 'deleted', is_deleted = true, updated_at = ?, deleted_at = coalesce(deleted_at, ?) where id = ? and is_deleted = false",
      [now, now, resumeId],
    );
  }

  async countActiveResumesByUser(userId: string): Promise<number> {
    const row = firstOrNull(
      await this.db.execute<{ count: number }>(
        "select count(*) as count from resumes where user_id = ? and is_deleted = false and status in ('generating', 'draft', 'published')",
        [userId],
      ),
    );
    return Number(row?.count ?? 0);
  }

  async listActiveResumesByUser(userId: string): Promise<ResumeRecord[]> {
    const rows = await this.db.execute<ResumeRow>(
      "select * from resumes where user_id = ? and is_deleted = false and status <> 'deleted' order by updated_at desc",
      [userId],
    );
    return rows.map((row) => mapResume(row)).filter((resume): resume is ResumeRecord => Boolean(resume));
  }

  async upsertResumeContent(input: { resumeId: string; content: ResumeContent; layout: ResumeLayout }): Promise<ResumeContentRecord> {
    const existing = await this.findResumeContent(input.resumeId);
    const now = this.now();
    if (existing) {
      await this.db.execute("update resume_contents set content_json = ?, layout_json = ?, updated_at = ? where resume_id = ?", [
        toMysqlJson(input.content),
        toMysqlJson(input.layout),
        now,
        input.resumeId,
      ]);
      return { ...existing, contentJson: input.content, layoutJson: input.layout, updatedAt: now };
    }

    const id = this.createId();
    await this.db.execute(
      "insert into resume_contents (id, resume_id, content_json, layout_json, created_at, updated_at, is_deleted, deleted_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
      [id, input.resumeId, toMysqlJson(input.content), toMysqlJson(input.layout), now, now, false, null],
    );
    return {
      id,
      resumeId: input.resumeId,
      contentJson: input.content,
      layoutJson: input.layout,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      deletedAt: null,
    };
  }

  async findResumeContent(resumeId: string): Promise<ResumeContentRecord | null> {
    return mapContent(
      firstOrNull(await this.db.execute<ContentRow>("select * from resume_contents where resume_id = ? and is_deleted = false limit 1", [resumeId])),
    );
  }

  async findLinkByResumeId(resumeId: string): Promise<ResumeLinkRecord | null> {
    return mapLink(firstOrNull(await this.db.execute<LinkRow>("select * from resume_links where resume_id = ? limit 1", [resumeId])));
  }

  async findLinkBySlug(slug: string): Promise<ResumeLinkRecord | null> {
    return mapLink(firstOrNull(await this.db.execute<LinkRow>("select * from resume_links where slug = ? limit 1", [slug])));
  }

  async linkSlugExists(slug: string): Promise<boolean> {
    return (await this.findLinkBySlug(slug)) !== null;
  }

  async createLink(input: Omit<ResumeLinkRecord, "createdAt" | "updatedAt" | "deletedAt" | "isDeleted">): Promise<ResumeLinkRecord> {
    const now = this.now();
    await this.db.execute(
      "insert into resume_links (id, resume_id, slug, access_mode, password_hash, is_active, created_at, updated_at, is_deleted, deleted_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [input.id, input.resumeId, input.slug, input.accessMode, input.passwordHash, input.isActive, now, now, false, null],
    );
    return { ...input, createdAt: now, updatedAt: now, isDeleted: false, deletedAt: null };
  }

  async updateLink(link: ResumeLinkRecord): Promise<ResumeLinkRecord> {
    const updatedAt = this.now();
    await this.db.execute(
      "update resume_links set slug = ?, access_mode = ?, password_hash = ?, is_active = ?, is_deleted = ?, updated_at = ?, deleted_at = ? where id = ?",
      [link.slug, link.accessMode, link.passwordHash, link.isActive, link.isDeleted, updatedAt, link.deletedAt, link.id],
    );
    return { ...link, updatedAt };
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  private createId(): string {
    return this.options.createId?.() ?? randomUUID();
  }
}

function mapResume(row: ResumeRow | null): ResumeRecord | null {
  return row
    ? {
        id: row.id,
        userId: row.user_id,
        title: row.title,
        status: row.status,
        sourceFileName: row.source_file_name,
        sourceFileType: row.source_file_type,
        sourceFileSize: row.source_file_size,
        currentTaskId: row.current_task_id,
        isDeleted: Boolean(row.is_deleted),
        createdAt: toDate(row.created_at),
        updatedAt: toDate(row.updated_at),
        deletedAt: nullableDate(row.deleted_at),
      }
    : null;
}

function mapContent(row: ContentRow | null): ResumeContentRecord | null {
  return row
    ? {
        id: row.id,
        resumeId: row.resume_id,
        contentJson: fromMysqlJson<ResumeContent>(row.content_json),
        layoutJson: fromMysqlJson<ResumeLayout>(row.layout_json),
        createdAt: toDate(row.created_at),
        updatedAt: toDate(row.updated_at),
        isDeleted: Boolean(row.is_deleted),
        deletedAt: nullableDate(row.deleted_at),
      }
    : null;
}

function mapLink(row: LinkRow | null): ResumeLinkRecord | null {
  return row
    ? {
        id: row.id,
        resumeId: row.resume_id,
        slug: row.slug,
        accessMode: row.access_mode,
        passwordHash: row.password_hash,
        isActive: Boolean(row.is_active),
        createdAt: toDate(row.created_at),
        updatedAt: toDate(row.updated_at),
        isDeleted: Boolean(row.is_deleted),
        deletedAt: nullableDate(row.deleted_at),
      }
    : null;
}
