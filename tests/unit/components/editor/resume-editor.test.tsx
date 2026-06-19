import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResumeEditor } from "@/components/editor/resume-editor";
import { sanitizeEditableHtml } from "@/components/editor/resume-editor-state";
import type { ResumeContent, ResumeLayout } from "@/types/resume";

const content: ResumeContent = {
  schemaVersion: 1,
  title: "Milu Resume",
  sections: [
    {
      id: "profile",
      type: "profile",
      title: "个人信息",
      visible: true,
      data: {
        name: "Milu",
        summary: { format: "html", html: "<p>Hello</p>", plainText: "Hello" },
      },
    },
  ],
  moduleOrder: ["profile"],
  assets: [],
  confirmationItems: [
    {
      id: "confirm-1",
      fieldPath: "sections.0.data.summary.plainText",
      message: "请确认摘要",
      status: "pending",
    },
  ],
};

const layout: ResumeLayout = {
  schemaVersion: 1,
  template: "default",
  theme: { fontFamily: "system", accentColor: "#0f766e", density: "comfortable" },
  sectionLayout: [{ sectionId: "profile", variant: "standard" }],
};

const contentWithExperience: ResumeContent = {
  ...content,
  sections: [
    ...content.sections,
    {
      id: "work",
      type: "work_experience",
      title: "工作经历",
      visible: true,
      items: [
        {
          id: "work-1",
          company: "Old Company",
          role: "Engineer",
          startDate: "2024",
          endDate: "2025",
          description: { format: "html", html: "<p>Built tools.</p>", plainText: "Built tools." },
        },
      ],
    },
  ],
  moduleOrder: [...content.moduleOrder, "work"],
};

const layoutWithExperience: ResumeLayout = {
  ...layout,
  sectionLayout: [...layout.sectionLayout, { sectionId: "work", variant: "timeline" }],
};

describe("ResumeEditor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    document.execCommand = vi.fn();
  });

  it("edits title, saves JSON content, and supports undo/redo", async () => {
    render(<ResumeEditor resumeId="resume-1" initialContent={content} initialLayout={layout} />);

    fireEvent.change(screen.getByLabelText("简历标题"), { target: { value: "Updated Resume" } });
    expect(screen.getAllByText("Updated Resume").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("撤销"));
    expect(screen.getAllByText("Milu Resume").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("重做"));
    fireEvent.click(screen.getByText("保存"));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [, request] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(request.method).toBe("PUT");
    expect(JSON.parse(request.body).content.title).toBe("Updated Resume");
  });

  it("adds and deletes sections while keeping a live preview", () => {
    render(<ResumeEditor resumeId="resume-1" initialContent={content} initialLayout={layout} />);

    expect(screen.getAllByLabelText("模块标题")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("新增模块类型"), { target: { value: "custom" } });
    fireEvent.click(screen.getByText("新增模块"));
    expect(screen.getAllByLabelText("模块标题")).toHaveLength(2);

    fireEvent.click(screen.getAllByText("删除")[1]);
    expect(screen.getAllByLabelText("模块标题")).toHaveLength(1);
  });

  it("updates confirmation item statuses", () => {
    render(<ResumeEditor resumeId="resume-1" initialContent={content} initialLayout={layout} />);

    expect(screen.getByText("pending")).toBeTruthy();
    fireEvent.click(screen.getByText("确认"));
    expect(screen.getByText("confirmed")).toBeTruthy();
  });

  it("edits structured experience item fields instead of a combined title", async () => {
    render(<ResumeEditor resumeId="resume-1" initialContent={contentWithExperience} initialLayout={layoutWithExperience} />);

    fireEvent.change(screen.getByLabelText("工作经历 公司 1"), { target: { value: "Codex Labs" } });
    fireEvent.change(screen.getByLabelText("工作经历 职位 1"), { target: { value: "Product Engineer" } });
    fireEvent.change(screen.getByLabelText("工作经历 开始时间 1"), { target: { value: "2025" } });
    fireEvent.change(screen.getByLabelText("工作经历 结束时间 1"), { target: { value: "至今" } });
    fireEvent.click(screen.getByText("保存"));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [, request] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const saved = JSON.parse(request.body) as { content: ResumeContent };
    const workSection = saved.content.sections.find((section) => section.id === "work");
    expect(workSection).toMatchObject({
      type: "work_experience",
      items: [
        {
          company: "Codex Labs",
          role: "Product Engineer",
          startDate: "2025",
          endDate: "至今",
        },
      ],
    });
  });

  it("sanitizes editable HTML", () => {
    expect(sanitizeEditableHtml('<p onclick="bad()">Hi<script>alert(1)</script><a href="javascript:bad()">x</a></p>')).toBe(
      "<p>Hi<a>x</a></p>",
    );
  });
});
