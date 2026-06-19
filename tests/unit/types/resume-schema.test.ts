import { describe, expect, it } from "vitest";
import {
  resumeContentSchema,
  validateResumeContentAndLayout,
  type ResumeContent,
  type ResumeLayout
} from "@/types/resume";

const content: ResumeContent = {
  schemaVersion: 1,
  title: "张三的简历",
  sections: [
    {
      id: "profile",
      type: "profile",
      title: "个人信息",
      visible: true,
      data: {
        name: "张三",
        email: "zhangsan@example.com",
        summary: {
          format: "html",
          html: "<p>前端工程师</p>",
          plainText: "前端工程师"
        }
      }
    }
  ],
  moduleOrder: ["profile"],
  assets: [],
  confirmationItems: []
};

const layout: ResumeLayout = {
  schemaVersion: 1,
  template: "default",
  theme: {
    fontFamily: "system",
    accentColor: "#0f766e",
    density: "comfortable"
  },
  sectionLayout: [{ sectionId: "profile", variant: "standard" }]
};

describe("resume schemas", () => {
  it("accepts a valid resume content document", () => {
    expect(resumeContentSchema.safeParse(content).success).toBe(true);
  });

  it("rejects moduleOrder entries that do not reference sections", () => {
    const result = resumeContentSchema.safeParse({
      ...content,
      moduleOrder: ["profile", "missing"]
    });

    expect(result.success).toBe(false);
  });

  it("validates layout references against content sections", () => {
    const result = validateResumeContentAndLayout(content, {
      ...layout,
      sectionLayout: [{ sectionId: "missing", variant: "standard" }]
    });

    expect(result.success).toBe(false);
  });
});
