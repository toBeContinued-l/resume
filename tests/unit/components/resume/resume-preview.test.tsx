import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import { ResumePreview } from "@/components/resume/resume-preview";
import type { ResumeContent } from "@/types/resume";

describe("ResumePreview", () => {
  it("renders public resume content, hides invisible sections and sanitizes rich text", () => {
    const { container } = render(<ResumePreview content={content} />);

    expect(container.querySelector("article.preview")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Milu Zhang" })).toBeTruthy();
    expect(screen.getByText(/Senior Product Engineer/)).toBeTruthy();
    expect(screen.getByText("Profile")).toBeTruthy();
    expect(screen.getByText("Skills")).toBeTruthy();
    expect(screen.queryByText("Hidden Notes")).toBeNull();
    expect(container.innerHTML).toContain("Builds TypeScript products.");
    expect(container.innerHTML).not.toContain("<script");
    expect(container.innerHTML).not.toContain("onclick");
    expect(container.innerHTML).not.toContain("<iframe");
    expect(container.innerHTML).not.toContain("javascript:");
  });
});

const content: ResumeContent = {
  schemaVersion: 1,
  title: "Milu Zhang",
  sections: [
    {
      id: "profile",
      type: "profile",
      title: "Profile",
      visible: true,
      data: {
        name: "Milu Zhang",
        headline: "Senior Product Engineer",
        summary: {
          format: "html",
          html: '<p onclick="alert(1)">Builds TypeScript products.</p><script>alert(1)</script><iframe src="https://evil.example"></iframe><a href="javascript:alert(1)">bad</a><a href="https://safe.example">safe</a>',
          plainText: "Builds TypeScript products.",
        },
      },
    },
    {
      id: "skills",
      type: "skill",
      title: "Skills",
      visible: true,
      groups: [{ id: "skills-1", name: "Frontend", skills: ["TypeScript", "React"] }],
    },
    {
      id: "hidden",
      type: "custom",
      title: "Hidden Notes",
      visible: false,
      content: { format: "html", html: "<p>Do not render.</p>", plainText: "Do not render." },
    },
  ],
  moduleOrder: ["profile", "skills", "hidden"],
  assets: [],
  confirmationItems: [],
};
