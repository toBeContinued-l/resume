import Link from "next/link";
import { cookies } from "next/headers";
import { DashboardList } from "./dashboard-list";
import { getAppServices } from "@/server/app-services";
import { SESSION_COOKIE_NAME } from "@/server/auth/session-cookie";
import { AuthError } from "@/server/auth/types";

export default async function DashboardPage() {
  const user = await getCurrentPageUser();
  if (!user) {
    return (
      <main className="app-shell narrow">
        <section className="panel">
          <p className="eyebrow">Dashboard</p>
          <h1>历史记录</h1>
          <p className="muted">登录后可以查看、编辑和删除自己的简历。</p>
          <Link className="button-link" href="/auth/login">去登录</Link>
        </section>
      </main>
    );
  }

  const summaries = await getAppServices().resumeService.listSummaries(user.id);
  const remaining = Math.max(0, 3 - (await getAppServices().resumeService.countActiveResumes(user.id)));

  return (
    <main className="app-shell">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h1>历史记录</h1>
          </div>
          <Link className="button-link" href="/resumes/upload">上传新简历</Link>
        </div>
        <p className="muted">当前还可上传 {remaining} 份简历。</p>
        <DashboardList summaries={summaries} />
      </section>
    </main>
  );
}

async function getCurrentPageUser() {
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
