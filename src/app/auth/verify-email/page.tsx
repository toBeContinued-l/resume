import { VerifyEmailForm } from "./verify-email-form";

export default async function VerifyEmailPage({ searchParams }: { searchParams?: Promise<{ token?: string }> }) {
  const query = await (searchParams ?? Promise.resolve({} as { token?: string }));
  return (
    <main className="app-shell narrow">
      <section className="panel">
        <h1>验证邮箱</h1>
        <VerifyEmailForm initialToken={query.token ?? ""} />
      </section>
    </main>
  );
}
