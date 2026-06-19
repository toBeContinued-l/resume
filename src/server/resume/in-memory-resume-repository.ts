import { randomUUID } from "crypto";
import type {
  ResumeContentRecord,
  ResumeLinkRecord,
  ResumeRecord,
  ResumeRepository,
} from "./types";

export class InMemoryResumeRepository implements ResumeRepository {
  readonly resumes = new Map<string, ResumeRecord>();
  readonly contents = new Map<string, ResumeContentRecord>();
  readonly links = new Map<string, ResumeLinkRecord>();

  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(input: { now?: () => Date; createId?: () => string } = {}) {
    this.now = input.now ?? (() => new Date());
    this.createId = input.createId ?? (() => randomUUID());
  }

  async createResume(input: Omit<ResumeRecord, "createdAt" | "updatedAt" | "deletedAt" | "isDeleted">): Promise<ResumeRecord> {
    const createdAt = this.now();
    const resume: ResumeRecord = {
      ...input,
      isDeleted: false,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    };
    this.resumes.set(resume.id, resume);
    return resume;
  }

  async findResumeById(resumeId: string): Promise<ResumeRecord | null> {
    return this.resumes.get(resumeId) ?? null;
  }

  async updateResume(resume: ResumeRecord): Promise<ResumeRecord> {
    const updated = { ...resume, updatedAt: this.now() };
    this.resumes.set(updated.id, updated);
    return updated;
  }

  async deleteResume(resumeId: string): Promise<void> {
    const now = this.now();
    const resume = this.resumes.get(resumeId);
    if (resume && !resume.isDeleted) {
      this.resumes.set(resumeId, {
        ...resume,
        status: "deleted",
        isDeleted: true,
        deletedAt: resume.deletedAt ?? now,
        updatedAt: now,
      });
    }
    const content = this.contents.get(resumeId);
    if (content && !content.isDeleted) {
      this.contents.set(resumeId, {
        ...content,
        isDeleted: true,
        deletedAt: content.deletedAt ?? now,
        updatedAt: now,
      });
    }
    for (const [linkId, link] of this.links.entries()) {
      if (link.resumeId === resumeId && !link.isDeleted) {
        this.links.set(linkId, {
          ...link,
          isActive: false,
          isDeleted: true,
          deletedAt: link.deletedAt ?? now,
          updatedAt: now,
        });
      }
    }
  }

  async countActiveResumesByUser(userId: string): Promise<number> {
    return [...this.resumes.values()].filter((resume) => resume.userId === userId && !resume.isDeleted && countsTowardUploadLimit(resume.status)).length;
  }

  async listActiveResumesByUser(userId: string): Promise<ResumeRecord[]> {
    return [...this.resumes.values()]
      .filter((resume) => resume.userId === userId && !resume.isDeleted && resume.status !== "deleted")
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
  }

  async upsertResumeContent(input: Parameters<ResumeRepository["upsertResumeContent"]>[0]): Promise<ResumeContentRecord> {
    const existing = this.contents.get(input.resumeId);
    if (existing) {
      const updated: ResumeContentRecord = {
        ...existing,
        contentJson: input.content,
        layoutJson: input.layout,
        updatedAt: this.now(),
        isDeleted: false,
        deletedAt: null,
      };
      this.contents.set(input.resumeId, updated);
      return updated;
    }

    const createdAt = this.now();
    const record: ResumeContentRecord = {
      id: this.createId(),
      resumeId: input.resumeId,
      contentJson: input.content,
      layoutJson: input.layout,
      createdAt,
      updatedAt: createdAt,
      isDeleted: false,
      deletedAt: null,
    };
    this.contents.set(input.resumeId, record);
    return record;
  }

  async findResumeContent(resumeId: string): Promise<ResumeContentRecord | null> {
    const content = this.contents.get(resumeId);
    return content && !content.isDeleted ? content : null;
  }

  async findLinkByResumeId(resumeId: string): Promise<ResumeLinkRecord | null> {
    return [...this.links.values()].find((link) => link.resumeId === resumeId) ?? null;
  }

  async findLinkBySlug(slug: string): Promise<ResumeLinkRecord | null> {
    return [...this.links.values()].find((link) => link.slug === slug) ?? null;
  }

  async linkSlugExists(slug: string): Promise<boolean> {
    return (await this.findLinkBySlug(slug)) !== null;
  }

  async createLink(input: Omit<ResumeLinkRecord, "createdAt" | "updatedAt" | "deletedAt" | "isDeleted">): Promise<ResumeLinkRecord> {
    const createdAt = this.now();
    const link: ResumeLinkRecord = {
      ...input,
      createdAt,
      updatedAt: createdAt,
      isDeleted: false,
      deletedAt: null,
    };
    this.links.set(link.id, link);
    return link;
  }

  async updateLink(link: ResumeLinkRecord): Promise<ResumeLinkRecord> {
    const updated = { ...link, updatedAt: this.now() };
    this.links.set(updated.id, updated);
    return updated;
  }

  seedLink(link: ResumeLinkRecord): void {
    this.links.set(link.id, link);
  }
}

function countsTowardUploadLimit(status: ResumeRecord["status"]): boolean {
  return status === "generating" || status === "draft" || status === "published";
}
