import { randomUUID } from "crypto";
import { basename } from "path";
import type {
  ResumeContent,
  ResumeContentRecord,
  ResumeLinkRecord,
  ResumeLayout,
  ResumeRecord,
  ResumeRepository,
  ResumeStatus,
  ResumeSummary,
  SourceFileType,
} from "./types";
import { ResumeError } from "./types";
import { sanitizeResumeContent, updateConfirmationStatus, validateResumeContentAndLayout } from "./validation";

export type ResumeServiceOptions = {
  now?: () => Date;
  createId?: () => string;
};

export type EditableResume = {
  resume: ResumeRecord;
  content: ResumeContent;
  layout: ResumeLayout;
  link: Pick<ResumeLinkRecord, "slug" | "accessMode" | "isActive"> | null;
};

export class ResumeService {
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    private readonly repository: ResumeRepository,
    options: ResumeServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? (() => randomUUID());
  }

  async createResume(input: {
    userId: string;
    title?: string;
    sourceFileName: string;
    sourceFileType: SourceFileType;
    sourceFileSize: number;
    currentTaskId: string;
  }): Promise<ResumeRecord> {
    return this.repository.createResume({
      id: this.createId(),
      userId: input.userId,
      title: input.title?.trim() || "Untitled resume",
      status: "generating",
      sourceFileName: sourceFileNameOnly(input.sourceFileName),
      sourceFileType: input.sourceFileType,
      sourceFileSize: input.sourceFileSize,
      currentTaskId: input.currentTaskId,
    });
  }

  async saveGeneratedContent(input: {
    userId: string;
    resumeId: string;
    content: ResumeContent;
    layout: ResumeLayout;
  }): Promise<ResumeContentRecord> {
    const resume = await this.requireOwnedResume(input.userId, input.resumeId);
    if (resume.status === "deleted") {
      throw new ResumeError("INVALID_STATE", "Deleted resume cannot be updated.");
    }

    const content = sanitizeResumeContent(input.content);
    validateResumeContentAndLayout(content, input.layout);
    const saved = await this.repository.upsertResumeContent({ resumeId: resume.id, content, layout: input.layout });
    await this.repository.updateResume({
      ...resume,
      title: content.title,
      status: "draft",
    });
    return saved;
  }

  async saveEditedContent(input: {
    userId: string;
    resumeId: string;
    content: ResumeContent;
    layout: ResumeLayout;
  }): Promise<ResumeContentRecord> {
    const resume = await this.requireOwnedResume(input.userId, input.resumeId);
    if (resume.status === "deleted") {
      throw new ResumeError("INVALID_STATE", "Deleted resume cannot be edited.");
    }
    if (resume.status === "generating") {
      throw new ResumeError("INVALID_STATE", "Generating resume cannot be edited yet.");
    }
    if (resume.status === "failed" || resume.status === "cancelled") {
      throw new ResumeError("INVALID_STATE", "Resume generation has not completed.");
    }

    const content = sanitizeResumeContent(input.content);
    validateResumeContentAndLayout(content, input.layout);
    const saved = await this.repository.upsertResumeContent({ resumeId: resume.id, content, layout: input.layout });
    await this.repository.updateResume({
      ...resume,
      title: content.title,
    });
    return saved;
  }

  async markGenerationStatus(input: {
    userId: string;
    resumeId: string;
    status: "generating" | "failed" | "cancelled";
  }): Promise<ResumeRecord> {
    const resume = await this.requireOwnedResume(input.userId, input.resumeId);
    if (resume.status === "deleted" || resume.status === "draft" || resume.status === "published") {
      return resume;
    }
    return this.repository.updateResume({
      ...resume,
      status: input.status,
    });
  }

  async getEditableResume(input: { userId: string; resumeId: string }): Promise<EditableResume> {
    const resume = await this.requireOwnedResume(input.userId, input.resumeId);
    if (resume.status === "deleted") {
      throw new ResumeError("INVALID_STATE", "Deleted resume cannot be edited.");
    }
    if (resume.status === "generating") {
      throw new ResumeError("INVALID_STATE", "Generating resume cannot be edited yet.");
    }
    if (resume.status === "failed" || resume.status === "cancelled") {
      throw new ResumeError("INVALID_STATE", "Resume generation has not completed.");
    }

    const existingContent = await this.repository.findResumeContent(resume.id);
    if (!existingContent) {
      throw new ResumeError("RESUME_NOT_FOUND", "Resume content does not exist.");
    }

    const link = await this.repository.findLinkByResumeId(resume.id);
    return {
      resume,
      content: existingContent.contentJson,
      layout: existingContent.layoutJson,
      link: link
        ? {
            slug: link.slug,
            accessMode: link.accessMode,
            isActive: link.isActive,
          }
        : null,
    };
  }

  async updateConfirmationItem(input: {
    userId: string;
    resumeId: string;
    itemId: string;
    status: ResumeContent["confirmationItems"][number]["status"];
  }): Promise<ResumeContentRecord> {
    const resume = await this.requireOwnedResume(input.userId, input.resumeId);
    if (resume.status === "deleted") {
      throw new ResumeError("INVALID_STATE", "Deleted resume cannot be edited.");
    }
    const existingContent = await this.repository.findResumeContent(resume.id);
    if (!existingContent) {
      throw new ResumeError("RESUME_NOT_FOUND", "Resume content does not exist.");
    }
    const content = updateConfirmationStatus(existingContent.contentJson, input.itemId, input.status);
    validateResumeContentAndLayout(content, existingContent.layoutJson);
    return this.repository.upsertResumeContent({ resumeId: resume.id, content, layout: existingContent.layoutJson });
  }

  async publish(input: { userId: string; resumeId: string }): Promise<ResumeRecord> {
    const resume = await this.requireOwnedResume(input.userId, input.resumeId);
    if (resume.status === "deleted") {
      throw new ResumeError("INVALID_STATE", "Deleted resume cannot be published.");
    }
    if (resume.status === "generating") {
      throw new ResumeError("INVALID_STATE", "Generating resume cannot be published.");
    }
    if (resume.status === "failed" || resume.status === "cancelled") {
      throw new ResumeError("INVALID_STATE", "Resume generation has not completed.");
    }
    return this.repository.updateResume({ ...resume, status: "published" });
  }

  async softDelete(input: { userId: string; resumeId: string }): Promise<ResumeRecord> {
    const resume = await this.requireOwnedResumeIncludingDeleted(input.userId, input.resumeId);
    if (resume.isDeleted || resume.status === "deleted") {
      return resume;
    }
    await this.repository.deleteResume(resume.id);
    return (
      (await this.repository.findResumeById(resume.id)) ?? {
        ...resume,
        status: "deleted",
        isDeleted: true,
        deletedAt: this.now(),
      }
    );
  }

  async countActiveResumes(userId: string): Promise<number> {
    return this.repository.countActiveResumesByUser(userId);
  }

  async listSummaries(userId: string): Promise<ResumeSummary[]> {
    const resumes = await this.repository.listActiveResumesByUser(userId);
    const summaries = await Promise.all(
      resumes.map(async (resume): Promise<ResumeSummary> => {
        const link = await this.repository.findLinkByResumeId(resume.id);
        return {
          id: resume.id,
          title: resume.title,
          status: resume.status as Exclude<ResumeStatus, "deleted">,
          createdAt: resume.createdAt,
          updatedAt: resume.updatedAt,
          link: link
            ? {
                slug: link.slug,
                accessMode: link.accessMode,
                isActive: link.isActive,
              }
            : null,
        };
      }),
    );
    return summaries;
  }

  async requireOwnedResume(userId: string, resumeId: string): Promise<ResumeRecord> {
    const resume = await this.requireOwnedResumeIncludingDeleted(userId, resumeId);
    if (resume.isDeleted || resume.status === "deleted") {
      throw new ResumeError("RESUME_NOT_FOUND", "Resume does not exist.");
    }
    return resume;
  }

  private async requireOwnedResumeIncludingDeleted(userId: string, resumeId: string): Promise<ResumeRecord> {
    const resume = await this.repository.findResumeById(resumeId);
    if (!resume) {
      throw new ResumeError("RESUME_NOT_FOUND", "Resume does not exist.");
    }
    if (resume.userId !== userId) {
      throw new ResumeError("FORBIDDEN", "Resume is owned by another user.");
    }
    return resume;
  }
}

function sourceFileNameOnly(fileName: string): string {
  return basename(fileName.replace(/\\/g, "/"));
}
