import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { AuthNav } from "@/components/auth/auth-nav";
import { getAppServices } from "@/server/app-services";
import { SESSION_COOKIE_NAME } from "@/server/auth/session-cookie";
import { AuthError } from "@/server/auth/types";
import "./globals.css";

export const metadata: Metadata = {
  title: "在线简历生成工具",
  description: "上传已有简历，生成可编辑和分享的在线简历。"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentLayoutUser();

  return (
    <html lang="zh-CN">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link className="brand-link" href="/">
              ResumeCraft
            </Link>
            <AuthNav user={user} />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}

async function getCurrentLayoutUser() {
  try {
    const cookieStore = await cookies();
    return await getAppServices().authService.getCurrentUser({
      sessionToken: cookieStore.get(SESSION_COOKIE_NAME)?.value,
    });
  } catch (error) {
    if (error instanceof AuthError || (error instanceof Error && (error as { code?: unknown }).code === "UNAUTHENTICATED")) {
      return null;
    }
    throw error;
  }
}
