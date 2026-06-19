"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { ApiResponse } from "@/types/api";

export function ResetPasswordForm({ initialToken }: { initialToken: string }) {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: formData.get("token"),
        newPassword: formData.get("newPassword"),
      }),
    });
    const body = (await response.json()) as ApiResponse<{ reset: boolean }>;

    if (!body.ok) {
      setStatus("error");
      setMessage(body.error.message);
      return;
    }

    setStatus("success");
    setMessage("密码已更新，可以使用新密码登录。");
  }

  return (
    <>
      <form className="stack" onSubmit={handleSubmit}>
        <input name="token" type="hidden" value={initialToken} />
        <label>
          新密码
          <input name="newPassword" type="password" required minLength={8} autoComplete="new-password" />
        </label>
        <button type="submit" disabled={status === "submitting"}>
          {status === "submitting" ? "正在更新..." : "更新密码"}
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
