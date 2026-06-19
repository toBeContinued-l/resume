"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { ApiResponse } from "@/types/api";

type LoginResponse = {
  user: {
    email: string;
  };
};

export function LoginForm() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    let body: ApiResponse<LoginResponse>;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const formData = new FormData(event.currentTarget);
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          email: formData.get("email"),
          password: formData.get("password"),
        }),
      });
      body = (await response.json()) as ApiResponse<LoginResponse>;
    } catch {
      setStatus("error");
      setMessage("登录请求失败，请稍后重试。");
      return;
    } finally {
      window.clearTimeout(timeout);
    }

    if (!body.ok) {
      setStatus("error");
      setMessage(body.error.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          邮箱
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          密码
          <input name="password" type="password" required autoComplete="current-password" />
        </label>
        <button type="submit" disabled={status === "submitting"}>
          {status === "submitting" ? "正在登录..." : "登录"}
        </button>
      </form>
      {message ? (
        <p className="form-message error" role="alert">
          {message}
        </p>
      ) : null}
    </>
  );
}
