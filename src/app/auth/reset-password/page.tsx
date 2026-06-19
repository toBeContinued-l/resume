import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage({ searchParams }: { searchParams?: Promise<{ token?: string }> }) {
  const query = await (searchParams ?? Promise.resolve({} as { token?: string }));
  return (
    <main className="app-shell narrow">
      <section className="panel">
        <h1>重置密码</h1>
        <ResetPasswordForm initialToken={query.token ?? ""} />
      </section>
    </main>
  );
}
