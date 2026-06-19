import type { Metadata } from "next";
import React from "react";
import { LegalPage, termsSections } from "../legal-content";

export const metadata: Metadata = {
  title: "用户协议 - 在线简历生成工具",
  description: "在线简历生成工具的用户协议，说明账号、简历生成、在线链接和用户责任。"
};

export default function TermsPage() {
  return (
    <LegalPage
      title="用户协议"
      updatedAt="2026-06-03"
      description="本协议说明用户使用在线简历生成工具时的账号、上传、生成、分享和责任边界。"
      sections={termsSections}
    />
  );
}
