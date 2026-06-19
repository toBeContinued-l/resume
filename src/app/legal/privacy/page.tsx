import type { Metadata } from "next";
import React from "react";
import { LegalPage, privacySections } from "../legal-content";

export const metadata: Metadata = {
  title: "隐私政策 - 在线简历生成工具",
  description: "在线简历生成工具的隐私政策，说明简历上传、临时文件、AI 服务、在线链接和删除规则。"
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="隐私政策"
      updatedAt="2026-06-03"
      description="本政策说明我们如何在账号、简历上传、生成、分享和删除过程中处理用户数据。"
      sections={privacySections}
    />
  );
}
