import { randomBytes, randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import type {
  ResumeContent,
  ResumeLayout,
  ResumeLinkAccessMode,
  ResumeLinkRecord,
  ResumeRepository,
} from "@/server/resume/types";
import { ResumeError } from "@/server/resume/types";

const SLUG_BYTES = 16;
const MAX_SLUG_ATTEMPTS = 8;

export type ResumeLinkServiceOptions = {
  now?: () => Date;
  createId?: () => string;
  createSlug?: () => string;
  hashPassword?: (password: string) => Promise<string>;
  comparePassword?: (password: string, hash: string) => Promise<boolean>;
};

export type LinkConfiguration = {
  resumeId: string;
  slug: string;
  accessMode: ResumeLinkAccessMode;
  isActive: boolean;
  hasPassword: boolean;
  urlPath: string;
  createdAt: Date;
  updatedAt: Date;
};

export type PublicResumeAccess =
  | { ok: false; reason: "not_found" | "inactive" | "deleted" | "password_required" }
  | {
      ok: true;
      link: LinkConfiguration;
      resume: {
        id: string;
        title: string;
        content: ResumeContent;
        layout: ResumeLayout;
      };
    };

export class ResumeLinkService {
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly createSlug: () => string;
  private readonly hashPassword: (password: string) => Promise<string>;
  private readonly comparePassword: (password: string, hash: string) => Promise<boolean>;

  constructor(
    private readonly repository: ResumeRepository,
    options: ResumeLinkServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? (() => randomUUID());
    this.createSlug = options.createSlug ?? generateSlug;
    this.hashPassword = options.hashPassword ?? ((password) => bcrypt.hash(password, 12));
    this.comparePassword = options.comparePassword ?? ((password, hash) => bcrypt.compare(password, hash));
  }

  async getOrCreateLink(input: { userId: string; resumeId: string }): Promise<LinkConfiguration> {
    const resume = await this.requireOwnedActiveResume(input.userId, input.resumeId);
    const link = await this.repository.findLinkByResumeId(resume.id);
    if (link && !link.isDeleted) {
      return toConfiguration(link);
    }
    if (link?.isDeleted) {
      return toConfiguration(
        await this.repository.updateLink({
          ...link,
          isActive: true,
          isDeleted: false,
          deletedAt: null,
        }),
      );
    }

    return toConfiguration(
      await this.repository.createLink({
        id: this.createId(),
        resumeId: resume.id,
        slug: await this.createUniqueSlug(),
        accessMode: "private_link",
        passwordHash: null,
        isActive: true,
      }),
    );
  }

  async updateLink(input: {
    userId: string;
    resumeId: string;
    accessMode: ResumeLinkAccessMode;
    password?: string;
  }): Promise<LinkConfiguration> {
    const resume = await this.requireOwnedActiveResume(input.userId, input.resumeId);
    const existing = await this.repository.findLinkByResumeId(resume.id);
    let link = existing;
    if (link?.isDeleted) {
      link = await this.repository.updateLink({
        ...link,
        isActive: true,
        isDeleted: false,
        deletedAt: null,
      });
    }
    if (!link) {
      link = await this.repository.createLink({
        id: this.createId(),
        resumeId: resume.id,
        slug: await this.createUniqueSlug(),
        accessMode: "private_link",
        passwordHash: null,
        isActive: true,
      });
    }

    let passwordHash: string | null = null;
    if (input.accessMode === "password") {
      if (input.password !== undefined && input.password.length > 0) {
        passwordHash = await this.hashPassword(input.password);
      } else if (link.passwordHash) {
        passwordHash = link.passwordHash;
      } else {
        throw new ResumeError("VALIDATION_ERROR", "Password is required for password access.");
      }
    }

    const updated = await this.repository.updateLink({
      ...link,
      accessMode: input.accessMode,
      passwordHash,
      isActive: true,
      updatedAt: this.now(),
    });
    return toConfiguration(updated);
  }

  async resolvePublicResume(input: { slug: string; password?: string }): Promise<PublicResumeAccess> {
    const link = await this.repository.findLinkBySlug(input.slug);
    if (!link) {
      return { ok: false, reason: "not_found" };
    }
    if (link.isDeleted || !link.isActive) {
      return { ok: false, reason: "inactive" };
    }

    const resume = await this.repository.findResumeById(link.resumeId);
    if (!resume || resume.isDeleted || resume.status === "deleted" || resume.deletedAt) {
      return { ok: false, reason: "deleted" };
    }

    if (link.accessMode === "password") {
      if (!input.password || !link.passwordHash) {
        return { ok: false, reason: "password_required" };
      }
      const valid = await this.comparePassword(input.password, link.passwordHash);
      if (!valid) {
        return { ok: false, reason: "password_required" };
      }
    }

    const content = await this.repository.findResumeContent(resume.id);
    if (!content) {
      return { ok: false, reason: "not_found" };
    }

    return {
      ok: true,
      link: toConfiguration(link),
      resume: {
        id: resume.id,
        title: resume.title,
        content: content.contentJson,
        layout: content.layoutJson,
      },
    };
  }

  async verifyPassword(input: { slug: string; password: string }): Promise<PublicResumeAccess> {
    const link = await this.repository.findLinkBySlug(input.slug);
    if (!link) {
      return { ok: false, reason: "not_found" };
    }
    if (link.isDeleted || !link.isActive) {
      return { ok: false, reason: "inactive" };
    }
    if (link.accessMode !== "password" || !link.passwordHash) {
      return { ok: false, reason: "not_found" };
    }
    const valid = await this.comparePassword(input.password, link.passwordHash);
    if (!valid) {
      return { ok: false, reason: "password_required" };
    }
    return this.resolvePublicResume({ slug: input.slug, password: input.password });
  }

  private async createUniqueSlug(): Promise<string> {
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
      const slug = this.createSlug();
      if (!(await this.repository.linkSlugExists(slug))) {
        return slug;
      }
    }
    throw new ResumeError("INVALID_STATE", "Could not create a unique public link.");
  }

  private async requireOwnedActiveResume(userId: string, resumeId: string) {
    const resume = await this.repository.findResumeById(resumeId);
    if (!resume) {
      throw new ResumeError("RESUME_NOT_FOUND", "Resume does not exist.");
    }
    if (resume.userId !== userId) {
      throw new ResumeError("FORBIDDEN", "Resume is owned by another user.");
    }
    if (resume.isDeleted || resume.status === "deleted" || resume.deletedAt) {
      throw new ResumeError("INVALID_STATE", "Deleted resume cannot have an active link.");
    }
    return resume;
  }
}

export function generateSlug(): string {
  return randomBytes(SLUG_BYTES).toString("base64url");
}

function toConfiguration(link: ResumeLinkRecord): LinkConfiguration {
  return {
    resumeId: link.resumeId,
    slug: link.slug,
    accessMode: link.accessMode,
    isActive: link.isActive,
    hasPassword: Boolean(link.passwordHash),
    urlPath: `/r/${link.slug}`,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  };
}
