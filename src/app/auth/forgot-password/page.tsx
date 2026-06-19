import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <main className="app-shell narrow">
      <section className="panel">
        <h1>找回密码</h1>
        <ForgotPasswordForm />
        <p className="muted">
          <Link href="/auth/login">返回登录</Link>
        </p>
      </section>
    </main>
  );
}
