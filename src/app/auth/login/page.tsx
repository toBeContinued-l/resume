import Link from "next/link";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="app-shell narrow">
      <section className="panel">
        <h1>登录</h1>
        <LoginForm />
        <p className="muted">
          <Link href="/auth/register">注册账号</Link> · <Link href="/auth/forgot-password">忘记密码</Link>
        </p>
      </section>
    </main>
  );
}
