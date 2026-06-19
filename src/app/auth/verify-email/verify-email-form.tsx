"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { ApiResponse } from "@/types/api";

type VerifyEmailResponse = {
  user: {
    email: string;
  };
};

export function VerifyEmailForm({ initialToken }: { initialToken: string }) {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: formData.get("token"),
        email: formData.get("email"),
        code: formData.get("code"),
      }),
    });
    const body = (await response.json()) as ApiResponse<VerifyEmailResponse>;

    if (!body.ok) {
      setStatus("error");
      setMessage(body.error.message);
      return;
    }

    setStatus("success");
    setMessage(`邮箱 ${body.data.user.email} 已验证，可以登录了。`);
  }

  return (
    <>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          邮箱
          <input name="email" type="email" autoComplete="email" />
        </label>
        <label>
          验证码
          <input name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" />
        </label>
        <label>
          邮件验证链接令牌
          <input name="token" defaultValue={initialToken} />
        </label>
        <button type="submit" disabled={status === "submitting"}>
          {status === "submitting" ? "正在验证..." : "完成验证"}
        </button>
      </form>
      {message ? <p className={`form-message ${status === "error" ? "error" : "success"}`}>{message}</p> : null}
      {status === "success" ? (
        <p className="form-message success">
          <Link href="/auth/login">去登录</Link>
        </p>
      ) : null}
    </>
  );
}
