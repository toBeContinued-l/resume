import { describe, expect, it } from "vitest";
import { InMemoryResumeRepository } from "../../../../src/server/resume/in-memory-resume-repository";
import { ResumeService } from "../../../../src/server/resume/resume-service";
import type { ResumeContent, ResumeLayout } from "../../../../src/server/resume/types";
import { collectResumeValidationErrors } from "../../../../src/server/resume/validation";

function sampleContent(overrides: Partial<ResumeContent> = {}): ResumeContent {
  const base: ResumeContent = {
    schemaVersion: 1,
    title: "Product Engineer Resume",
    sections: [
      {
        id: "profile",
        type: "profile",
        title: "Profile",
        visible: true,
        data: {
          name: "Milu",
          summary: {
            format: "html",
            html: '<p onclick="alert(1)">Builds systems</p><script>alert(1)</script>',
            plainText: "Builds systems",
          },
        },
      },
      {
        id: "skills",
        type: "skill",
        title: "Skills",
        visible: true,
        groups: [{ id: "skills-1", name: "Backend", skills: ["TypeScript", "MySQL"] }],
      },
    ],
    moduleOrder: ["profile", "skills"],
    assets: [{ id: "asset-1", kind: "image", mimeType: "image/png", dataRef: "asset://avatar" }],
    confirmationItems: [
      {
        id: "confirm-1",
        fieldPath: "sections[0].data.summary.plainText",
        message: "Confirm summary wording.",
        status: "pending",
      },
    ],
  };
  return { ...base, ...overrides };
}

function sampleLayout(overrides: Partial<ResumeLayout> = {}): ResumeLayout {
  const base: ResumeLayout = {
    schemaVersion: 1,
    template: "default",
    theme: {
      fontFamily: "system",
      accentColor: "#2357D8",
      density: "comfortable",
    },
    sectionLayout: [
      { sectionId: "profile", variant: "standard" },
      { sectionId: "skills", variant: "tag_group" },
    ],
  };
  return { ...base, ...overrides };
}

function createHarness() {
  let id = 0;
  let now = new Date("2026-01-01T00:00:00.000Z");
  const repository = new InMemoryResumeRepository({
    now: () => now,
    createId: () => `content-${++id}`,
  });
  const service = new ResumeService(repository, {
    now: () => now,
    createId: () => `resume-${++id}`,
  });
  return {
    repository,
    service,
    tick: () => {
      now = new Date(now.getTime() + 1_000);
    },
  };
}

describe("ResumeService", () => {
  it("creates a generating resume with source metadata but not original paths", async () => {
    const { service } = createHarness();

    const resume = await service.createResume({
      userId: "user-1",
      sourceFileName: "/tmp/online-resume/uploads/user-1/task/original.docx",
      sourceFileType: "docx",
      sourceFileSize: 1024,
      currentTaskId: "task-1",
    });

    expect(resume.status).toBe("generating");
    expect(resume.sourceFileName).toBe("original.docx");
    expect(resume.sourceFileName).not.toContain("/tmp/");
  });

  it("saves generated content, sanitizes rich text, and moves resume to draft", async () => {
    const { repository, service } = createHarness();
    const resume = await service.createResume({
      userId: "user-1",
      sourceFileName: "resume.docx",
      sourceFileType: "docx",
      sourceFileSize: 1024,
      currentTaskId: "task-1",
    });

    const saved = await service.saveGeneratedContent({
      userId: "user-1",
      resumeId: resume.id,
      content: sampleContent(),
      layout: sampleLayout(),
    });

    const updatedResume = await repository.findResumeById(resume.id);
    expect(updatedResume?.status).toBe("draft");
    expect(saved.contentJson.sections[0]).toMatchObject({
      data: { summary: { html: "<p>Builds systems</p>" } },
    });
  });

  it("rejects module order, layout, confirmation path, and temporary asset mismatches", () => {
    expect(collectResumeValidationErrors(sampleContent({ moduleOrder: ["profile"] }), sampleLayout())).toContain(
      "ResumeContent.moduleOrder must contain exactly every section ID.",
    );
    expect(
      collectResumeValidationErrors(
        sampleContent(),
        sampleLayout({ sectionLayout: [{ sectionId: "profile", variant: "standard" }] }),
      ),
    ).toContain("ResumeLayout.sectionLayout must contain exactly every section ID.");
    expect(
      collectResumeValidationErrors(
        sampleContent({ confirmationItems: [{ id: "bad", fieldPath: "sections[5].title", message: "Bad", status: "pending" }] }),
        sampleLayout(),
      ),
    ).toContain("ConfirmationItem bad points to a missing field.");
    expect(
      collectResumeValidationErrors(
        sampleContent({ assets: [{ id: "bad-asset", kind: "image", mimeType: "image/png", dataRef: "/tmp/uploads/original.png" }] }),
        sampleLayout(),
      ),
    ).toContain("ResumeAsset bad-asset must not reference an original temporary upload path.");
  });

  it("enforces ownership and deleted state before editing", async () => {
    const { repository, service } = createHarness();
    const resume = await service.createResume({
      userId: "user-1",
      sourceFileName: "resume.docx",
      sourceFileType: "docx",
      sourceFileSize: 1024,
      currentTaskId: "task-1",
    });

    await expect(
      service.saveGeneratedContent({ userId: "user-2", resumeId: resume.id, content: sampleContent(), layout: sampleLayout() }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await service.saveGeneratedContent({ userId: "user-1", resumeId: resume.id, content: sampleContent(), layout: sampleLayout() });
    await service.softDelete({ userId: "user-1", resumeId: resume.id });
    await expect(repository.findResumeById(resume.id)).resolves.toMatchObject({
      id: resume.id,
      isDeleted: true,
      status: "deleted",
      deletedAt: expect.any(Date),
    });

    await expect(
      service.saveEditedContent({ userId: "user-1", resumeId: resume.id, content: sampleContent(), layout: sampleLayout() }),
    ).rejects.toMatchObject({ code: "RESUME_NOT_FOUND" });
  });

  it("updates confirmation item status through allowed transitions", async () => {
    const { service } = createHarness();
    const resume = await service.createResume({
      userId: "user-1",
      sourceFileName: "resume.docx",
      sourceFileType: "docx",
      sourceFileSize: 1024,
      currentTaskId: "task-1",
    });
    await service.saveGeneratedContent({ userId: "user-1", resumeId: resume.id, content: sampleContent(), layout: sampleLayout() });

    const updated = await service.updateConfirmationItem({
      userId: "user-1",
      resumeId: resume.id,
      itemId: "confirm-1",
      status: "confirmed",
    });

    expect(updated.contentJson.confirmationItems[0].status).toBe("confirmed");
    await expect(
      service.updateConfirmationItem({ userId: "user-1", resumeId: resume.id, itemId: "missing", status: "dismissed" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("soft deletes resumes, excludes them from active count, and invalidates links", async () => {
    const { repository, service } = createHarness();
    const resume = await service.createResume({
      userId: "user-1",
      sourceFileName: "resume.docx",
      sourceFileType: "docx",
      sourceFileSize: 1024,
      currentTaskId: "task-1",
    });
    repository.seedLink({
      id: "link-1",
      resumeId: resume.id,
      slug: "public-slug",
      accessMode: "public",
      passwordHash: null,
      isActive: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      isDeleted: false,
      deletedAt: null,
    });

    expect(await service.countActiveResumes("user-1")).toBe(1);
    const deleted = await service.softDelete({ userId: "user-1", resumeId: resume.id });

    expect(deleted.status).toBe("deleted");
    expect(deleted.deletedAt).toBeInstanceOf(Date);
    expect(await service.countActiveResumes("user-1")).toBe(0);
    expect(await repository.findLinkByResumeId(resume.id)).toMatchObject({ isActive: false });
  });

  it("does not count failed or cancelled generated records toward the upload limit", async () => {
    const { service } = createHarness();
    const failed = await service.createResume({
      userId: "user-1",
      sourceFileName: "failed.docx",
      sourceFileType: "docx",
      sourceFileSize: 1024,
      currentTaskId: "task-1",
    });
    const cancelled = await service.createResume({
      userId: "user-1",
      sourceFileName: "cancelled.pdf",
      sourceFileType: "pdf",
      sourceFileSize: 1024,
      currentTaskId: "task-2",
    });

    await service.markGenerationStatus({ userId: "user-1", resumeId: failed.id, status: "failed" });
    await service.markGenerationStatus({ userId: "user-1", resumeId: cancelled.id, status: "cancelled" });

    expect(await service.countActiveResumes("user-1")).toBe(0);
  });

  it("returns history summaries only for non-deleted resumes owned by the user", async () => {
    const { service } = createHarness();
    const first = await service.createResume({
      userId: "user-1",
      title: "First",
      sourceFileName: "first.docx",
      sourceFileType: "docx",
      sourceFileSize: 1,
      currentTaskId: "task-1",
    });
    await service.createResume({
      userId: "user-2",
      title: "Other",
      sourceFileName: "other.docx",
      sourceFileType: "docx",
      sourceFileSize: 1,
      currentTaskId: "task-2",
    });
    await service.softDelete({ userId: "user-1", resumeId: first.id });
    await service.createResume({
      userId: "user-1",
      title: "Second",
      sourceFileName: "second.docx",
      sourceFileType: "docx",
      sourceFileSize: 1,
      currentTaskId: "task-3",
    });

    expect(await service.listSummaries("user-1")).toMatchObject([{ title: "Second" }]);
  });
});
