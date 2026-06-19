import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import PrivacyPage from "@/app/legal/privacy/page";
import TermsPage from "@/app/legal/terms/page";

describe("legal pages", () => {
  it("renders the terms page with account, resume, link, and responsibility coverage", () => {
    render(<TermsPage />);

    expect(screen.getByRole("heading", { level: 1, name: "用户协议" })).toBeTruthy();
    expect(screen.getByText("账号使用")).toBeTruthy();
    expect(screen.getByText("简历生成服务")).toBeTruthy();
    expect(screen.getByText("在线链接")).toBeTruthy();
    expect(screen.getByText("用户责任")).toBeTruthy();
  });

  it("renders the privacy page with upload, temp file, AI, link, and deletion coverage", () => {
    render(<PrivacyPage />);

    expect(screen.getByRole("heading", { level: 1, name: "隐私政策" })).toBeTruthy();
    expect(screen.getByText("简历文件上传用途")).toBeTruthy();
    expect(screen.getByText("原始文件临时保存与删除")).toBeTruthy();
    expect(screen.getByText("AI 服务使用")).toBeTruthy();
    expect(screen.getByText("在线链接访问模式")).toBeTruthy();
    expect(screen.getByText("删除规则与首期范围")).toBeTruthy();
  });
});
