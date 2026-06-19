import type {
  ConfirmationItem,
  ResumeContent,
  ResumeLayout
} from "../../types/resume";

export type {
  ConfirmationItem,
  ResumeAsset,
  ResumeContent,
  ResumeLayout,
  ResumeSection,
  RichText,
} from "../../types/resume";

export type ResumeStatus = "generating" | "draft" | "published" | "failed" | "cancelled" | "deleted";
export type SourceFileType = "doc" | "docx" | "pdf";
export type ConfirmationStatus = ConfirmationItem["status"];

type SoftDeleteRecord = {
  isDeleted: boolean;
  deletedAt: Date | null;
};

export type ResumeRecord = {
  id: string;
  userId: string;
  title: string;
  status: ResumeStatus;
  sourceFileName: string | null;
  sourceFileType: SourceFileType | null;
  sourceFileSize: number | null;
  currentTaskId: string | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type ResumeContentRecord = {
  id: string;
  resumeId: string;
  contentJson: ResumeContent;
  layoutJson: ResumeLayout;
  createdAt: Date;
  updatedAt: Date;
} & SoftDeleteRecord;

export type ResumeLinkRecord = {
  id: string;
  resumeId: string;
  slug: string;
  accessMode: "public" | "private_link" | "password";
  passwordHash: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
} & SoftDeleteRecord;

export type ResumeLinkAccessMode = ResumeLinkRecord["accessMode"];

export type ResumeSummary = {
  id: string;
  title: string;
  status: Exclude<ResumeStatus, "deleted">;
  createdAt: Date;
  updatedAt: Date;
  link: { slug: string; accessMode: ResumeLinkRecord["accessMode"]; isActive: boolean } | null;
};

export type ResumeValidationResult =
  | { ok: true; content: ResumeContent; layout: ResumeLayout }
  | { ok: false; errors: string[] };

export type ResumeErrorCode = "VALIDATION_ERROR" | "RESUME_NOT_FOUND" | "FORBIDDEN" | "INVALID_STATE";

export class ResumeError extends Error {
  constructor(
    readonly code: ResumeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ResumeError";
  }
}

export interface ResumeRepository {
  createResume(input: Omit<ResumeRecord, "createdAt" | "updatedAt" | "deletedAt" | "isDeleted">): Promise<ResumeRecord>;
  findResumeById(resumeId: string): Promise<ResumeRecord | null>;
  updateResume(resume: ResumeRecord): Promise<ResumeRecord>;
  deleteResume(resumeId: string): Promise<void>;
  countActiveResumesByUser(userId: string): Promise<number>;
  listActiveResumesByUser(userId: string): Promise<ResumeRecord[]>;

  upsertResumeContent(input: { resumeId: string; content: ResumeContent; layout: ResumeLayout }): Promise<ResumeContentRecord>;
  findResumeContent(resumeId: string): Promise<ResumeContentRecord | null>;

  findLinkByResumeId(resumeId: string): Promise<ResumeLinkRecord | null>;
  findLinkBySlug(slug: string): Promise<ResumeLinkRecord | null>;
  linkSlugExists(slug: string): Promise<boolean>;
  createLink(input: Omit<ResumeLinkRecord, "createdAt" | "updatedAt" | "deletedAt" | "isDeleted">): Promise<ResumeLinkRecord>;
  updateLink(link: ResumeLinkRecord): Promise<ResumeLinkRecord>;
}
