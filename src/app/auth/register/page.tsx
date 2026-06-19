import type { Metadata } from "next";
import Link from "next/link";
import React from "react";
import { RegisterForm } from "./register-form";
import styles from "./register.module.css";

export const metadata: Metadata = {
  title: "注册 - 在线简历生成工具",
  description: "创建在线简历生成工具账号，并阅读用户协议与隐私政策。"
};

export default function RegisterPage() {
  return (
    <main className={styles.shell}>
      <section className={styles.panel} aria-labelledby="register-title">
        <p className="eyebrow">Account</p>
        <h1 id="register-title">创建账号</h1>
        <RegisterForm />
        <p>
          创建账号前，请阅读并同意
          <Link href="/legal/terms">用户协议</Link>
          和
          <Link href="/legal/privacy">隐私政策</Link>。
        </p>
      </section>
    </main>
  );
}
