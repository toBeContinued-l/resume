import { describe, expect, it } from "vitest";
import { ResumeLinkService } from "@/server/links/resume-link-service";
import { InMemoryResumeRepository } from "@/server/resume/in-memory-resume-repository";
import { ResumeService } from "@/server/resume/resume-service";
import type { ResumeContent, ResumeLayout } from "@/types/resume";

const content: ResumeContent = {
  schemaVersion: 1,
  title: "Milu",
  sections: [{ id: "profile", type: "profile", title: "Profile", visible: true, data: { name: "Milu" } }],
  moduleOrder: ["profile"],
  assets: [],
  confirmationItems: [],
};

const layout: ResumeLayout = {
  schemaVersion: 1,
  template: "default",
  theme: { fontFamily: "system", accentColor: "#0f766e", density: "comfortable" },
  sectionLayout: [{ sectionId: "profile", variant: "standard" }],
};

async function createFixture() {
  const repository = new InMemoryResumeRepository();
  const resumeService = new ResumeService(repository, { createId: () => "resume-1" });
  await resumeService.createResume({
    userId: "user-1",
    title: "Milu",
    sourceFileName: "resume.pdf",
    sourceFileType: "pdf",
    sourceFileSize: 100,
    currentTaskId: "task-1",
  });
  await resumeService.saveGeneratedContent({ userId: "user-1", resumeId: "resume-1", content, layout });
  return { repository, resumeService };
}

describe("ResumeLinkService", () => {
  it("creates stable private links and resolves anonymous access", async () => {
    const { repository } = await createFixture();
    const service = new ResumeLinkService(repository, { createSlug: () => "slug-1" });

    const link = await service.getOrCreateLink({ userId: "user-1", resumeId: "resume-1" });
    const again = await service.getOrCreateLink({ userId: "user-1", resumeId: "resume-1" });
    const access = await service.resolvePublicResume({ slug: "slug-1" });

    expect(link.slug).toBe("slug-1");
    expect(again.slug).toBe("slug-1");
    expect(access.ok && access.resume.title).toBe("Milu");
  });

  it("hashes password links and does not reveal content on wrong password", async () => {
    const { repository } = await createFixture();
    const service = new ResumeLinkService(repository, { createSlug: () => "secret" });

    await service.updateLink({ userId: "user-1", resumeId: "resume-1", accessMode: "password", password: "letmein" });
    const link = await repository.findLinkBySlug("secret");

    expect(link?.passwordHash).not.toBe("letmein");
    expect(await service.resolvePublicResume({ slug: "secret" })).toEqual({ ok: false, reason: "password_required" });
    expect((await service.verifyPassword({ slug: "secret", password: "letmein" })).ok).toBe(true);
  });

  it("invalidates links when a resume is deleted", async () => {
    const { repository, resumeService } = await createFixture();
    const service = new ResumeLinkService(repository, { createSlug: () => "gone" });
    await service.getOrCreateLink({ userId: "user-1", resumeId: "resume-1" });

    await resumeService.softDelete({ userId: "user-1", resumeId: "resume-1" });

    expect(await service.resolvePublicResume({ slug: "gone" })).toEqual({ ok: false, reason: "inactive" });
  });
});
