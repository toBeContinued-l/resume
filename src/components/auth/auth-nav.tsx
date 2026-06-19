import Link from "next/link";
import { LogoutButton } from "@/components/auth/logout-button";

type AuthNavProps = {
  user: { email: string } | null;
};

export function AuthNav({ user }: AuthNavProps) {
  return (
    <nav className="main-nav" aria-label="主导航">
      <Link href="/#workflow">流程</Link>
      <Link href="/resumes/upload">上传生成</Link>
      <Link href="/dashboard">历史记录</Link>
      {user ? (
        <>
          <Link className="nav-user-link" href="/dashboard" aria-label={`当前账户 ${user.email}`}>
            {user.email}
          </Link>
          <LogoutButton />
        </>
      ) : (
        <>
          <Link href="/auth/login">登录</Link>
          <Link href="/auth/register">注册</Link>
        </>
      )}
    </nav>
  );
}
