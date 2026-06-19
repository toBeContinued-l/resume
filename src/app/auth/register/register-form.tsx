"use client";

import { useState, type FormEvent } from "react";
import type { ApiResponse } from "@/types/api";

type RegisterResponse = {
  user: {
    email: string;
    status: string;
  };
  devVerificationCode?: string;
};

type VerifyEmailResponse = {
  user: {
    email: string;
  };
};

export function RegisterForm() {
  const [step, setStep] = useState<"account" | "code" | "verified">("account");
  const [status, setStatus] = useState<"idle" | "registering" | "verifying" | "error">("idle");
  const [message, setMessage] = useState("");
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [devVerificationCode, setDevVerificationCode] = useState<string | null>(null);

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("registering");
    setMessage("");
    setDevVerificationCode(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        password: formData.get("password"),
      }),
    });
    const body = (await response.json()) as ApiResponse<RegisterResponse>;

    if (!body.ok) {
      setStatus("error");
      setMessage(body.error.message);
      return;
    }

    setRegisteredEmail(body.data.user.email);
    setStep("code");
    setStatus("idle");
    setMessage(`验证码已发送至 ${body.data.user.email}，请复制邮件中的 6 位验证码完成注册。`);
    setDevVerificationCode(body.data.devVerificationCode ?? null);
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("verifying");
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: registeredEmail,
        code: formData.get("code"),
      }),
    });
    const body = (await response.json()) as ApiResponse<VerifyEmailResponse>;

    if (!body.ok) {
      setStatus("error");
      setMessage(body.error.message);
      return;
    }

    setStep("verified");
    setStatus("idle");
    setMessage(`邮箱 ${body.data.user.email} 已验证，可以登录并上传简历了。`);
  }

  return (
    <>
      {step === "account" ? (
        <form className="stack" onSubmit={handleRegister}>
          <label>
            邮箱
            <input name="email" type="email" required autoComplete="email" defaultValue={registeredEmail} />
          </label>
          <label>
            密码
            <input name="password" type="password" required minLength={8} autoComplete="new-password" />
          </label>
          <button type="submit" disabled={status === "registering"}>
            {status === "registering" ? "正在发送验证码..." : "注册并发送验证码"}
          </button>
        </form>
      ) : null}

      {step === "code" ? (
        <form className="stack" onSubmit={handleVerify}>
          <label>
            邮箱
            <input value={registeredEmail} readOnly />
          </label>
          <label>
            邮件验证码
            <input
              name="code"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              autoComplete="one-time-code"
              autoFocus
            />
          </label>
          <div className="actions left">
            <button type="submit" disabled={status === "verifying"}>
              {status === "verifying" ? "正在验证..." : "完成验证"}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setStep("account");
                setStatus("idle");
                setMessage("");
                setDevVerificationCode(null);
              }}
            >
              重新填写
            </button>
          </div>
        </form>
      ) : null}

      {message ? <p className={`form-message ${status === "error" ? "error" : "success"}`}>{message}</p> : null}
      {devVerificationCode ? <p className="form-message success">开发模式验证码：{devVerificationCode}</p> : null}
      {step === "verified" ? (
        <a className="button-link" href="/auth/login">
          去登录
        </a>
      ) : null}
    </>
  );
}
