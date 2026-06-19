import { ResumePreview } from "@/components/resume/resume-preview";
import { PasswordProtectedResume } from "./password-protected-resume";

export default async function PublicResumePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { getAppServices } = await import("@/server/app-services");
  const access = await getAppServices().resumeLinkService.resolvePublicResume({
    slug,
  });

  if (!access.ok) {
    if (access.reason === "password_required") {
      return <PasswordProtectedResume slug={slug} />;
    }
    return (
      <main className="app-shell narrow">
        <section className="panel">
          <h1>无法访问简历</h1>
          <p className="muted">链接不存在、已失效，或简历已删除。</p>
        </section>
      </main>
    );
  }

  return (
    <main className="public-shell">
      <ResumePreview content={access.resume.content} />
    </main>
  );
}

export const dynamic = "force-dynamic";
