import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PasswordProtectedResume } from "@/app/r/[slug]/password-protected-resume";

describe("PasswordProtectedResume", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("verifies the password through POST instead of putting it in the URL", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({
        ok: true,
        data: {
          verified: true,
          resume: {
            id: "resume-1",
            title: "Protected Resume",
            content: {
              schemaVersion: 1,
              title: "Protected Resume",
              sections: [
                {
                  id: "profile",
                  type: "profile",
                  title: "Profile",
                  visible: true,
                  data: {
                    name: "Jane Doe",
                  },
                },
              ],
              moduleOrder: ["profile"],
              assets: [],
              confirmationItems: [],
            },
            layout: {
              schemaVersion: 1,
              template: "default",
              theme: {
                fontFamily: "system",
                accentColor: "#2357D8",
                density: "comfortable",
              },
              sectionLayout: [{ sectionId: "profile", variant: "standard" }],
            },
          },
          link: {
            slug: "slug-1",
            accessMode: "password",
            isActive: true,
            hasPassword: true,
            urlPath: "/r/slug-1",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            resumeId: "resume-1",
          },
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<PasswordProtectedResume slug="slug-1" />);

    fireEvent.change(screen.getByLabelText("访问密码"), { target: { value: "visitor-pass" } });
    fireEvent.submit(screen.getByRole("button", { name: "查看简历" }).closest("form")!);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/public-links/slug-1/verify-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "visitor-pass" }),
      }),
    );
    expect(await screen.findByRole("heading", { level: 2, name: "Protected Resume" })).toBeTruthy();
  });
});
