"use client";

import { useState, type FormEvent } from "react";
import { ResumePreview } from "@/components/resume/resume-preview";
import type { ApiResponse } from "@/types/api";
import type { ResumeContent, ResumeLayout } from "@/types/resume";

type VerifiedResumeResponse = {
  verified: true;
  resume: {
    id: string;
    title: string;
    content: ResumeContent;
    layout: ResumeLayout;
  };
  link: {
    slug: string;
    accessMode: string;
    isActive: boolean;
    hasPassword: boolean;
    urlPath: string;
    createdAt: string;
    updatedAt: string;
    resumeId: string;
  };
};

type FailedResumeResponse = {
  verified: false;
  reason: string;
};

export function PasswordProtectedResume({ slug }: { slug: string }) {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error" | "verified">("idle");
  const [message, setMessage] = useState("");
  const [content, setContent] = useState<ResumeContent | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    let body: ApiResponse<VerifiedResumeResponse | FailedResumeResponse>;
    try {
      const response = await fetch(`/api/public-links/${slug}/verify-password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      body = (await response.json()) as ApiResponse<VerifiedResumeResponse | FailedResumeResponse>;
    } catch {
      setStatus("error");
      setMessage("验证请求失败，请稍后重试。");
      return;
    }

    if (!body.ok) {
      setStatus("error");
      setMessage(body.error.message);
      return;
    }

    if (!body.data.verified) {
      setStatus("error");
      setMessage("访问密码错误或链接已失效。");
      return;
    }

    setContent(body.data.resume.content);
    setStatus("verified");
  }

  if (status === "verified" && content) {
    return (
      <main className="public-shell">
        <ResumePreview content={content} />
      </main>
    );
  }

  return (
    <main className="app-shell narrow">
      <section className="panel">
        <h1>无法直接访问简历</h1>
        <form className="stack" onSubmit={handleSubmit}>
          <label>
            访问密码
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button type="submit" disabled={status === "submitting"}>
            {status === "submitting" ? "正在验证..." : "查看简历"}
          </button>
        </form>
        {message ? <p className="form-message error">{message}</p> : null}
      </section>
    </main>
  );
}
