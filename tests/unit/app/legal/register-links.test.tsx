import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import RegisterPage from "@/app/auth/register/page";

describe("register page legal links", () => {
  it("links to terms and privacy pages", () => {
    render(<RegisterPage />);

    expect(screen.getByRole("link", { name: "用户协议" }).getAttribute("href")).toBe(
      "/legal/terms"
    );
    expect(screen.getByRole("link", { name: "隐私政策" }).getAttribute("href")).toBe(
      "/legal/privacy"
    );
  });
});
