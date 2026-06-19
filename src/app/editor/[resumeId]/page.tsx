import Link from "next/link";
import { cookies } from "next/headers";
import { getAppServices } from "@/server/app-services";
import { SESSION_COOKIE_NAME } from "@/server/auth/session-cookie";
import { AuthError } from "@/server/auth/types";
import { ResumeEditor } from "@/components/editor/resume-editor";

export default async function EditorPage({ params }: { params: Promise<{ resumeId: string }> }) {
  const { resumeId } = await params;
  const user = await getCurrentPageUser();
  if (!user) {
    return (
      <main className="app-shell narrow">
        <section className="panel">
          <h1>编辑简历</h1>
          <p className="muted">登录后可以编辑自己的简历。</p>
          <Link className="button-link" href="/auth/login">去登录</Link>
        </section>
      </main>
    );
  }

  const editable = await getAppServices().resumeService.getEditableResume({
    userId: user.id,
    resumeId,
  });

  return <ResumeEditor resumeId={resumeId} initialContent={editable.content} initialLayout={editable.layout} initialAccessMode={editable.link?.accessMode} />;
}

async function getCurrentPageUser() {
  try {
    const cookieStore = await cookies();
    return await getAppServices().authService.getCurrentUser({
      sessionToken: cookieStore.get(SESSION_COOKIE_NAME)?.value,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return null;
    }
    throw error;
  }
}
