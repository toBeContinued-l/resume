"use client";

import { useState, type FormEvent } from "react";
import type { ApiResponse } from "@/types/api";

export function ForgotPasswordForm() {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: formData.get("email") }),
    });
    const body = (await response.json()) as ApiResponse<{ sent: boolean }>;

    if (!body.ok) {
      setStatus("error");
      setMessage(body.error.message);
      return;
    }

    setStatus("success");
    setMessage("如果该邮箱存在且已激活，重置链接会发送到对应邮箱。");
  }

  return (
    <>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          注册邮箱
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <button type="submit" disabled={status === "submitting"}>
          {status === "submitting" ? "正在发送..." : "发送重置邮件"}
        </button>
      </form>
      {message ? <p className={`form-message ${status === "error" ? "error" : "success"}`}>{message}</p> : null}
    </>
  );
}
