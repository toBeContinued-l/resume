"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ApiResponse } from "@/types/api";

type UploadResponse = {
  resumeId: string;
  taskId: string;
  status: "pending";
};

type TaskProgressResponse = {
  taskId: string;
  resumeId: string;
  status: "pending" | "parsing" | "ai_processing" | "completed" | "failed" | "cancelled";
  retryCount: number;
  message: string;
  stageIndex: number;
  stageCount: number;
  progressPercent: number;
  canCancel: boolean;
  canRetry: boolean;
  errorMessage?: string;
};

export function UploadResumeForm() {
  const router = useRouter();
  const pollingTaskId = useRef<string | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "processing" | "completed" | "error">("idle");
  const [message, setMessage] = useState("");
  const [task, setTask] = useState<UploadResponse | null>(null);
  const [progress, setProgress] = useState<TaskProgressResponse | null>(null);
  const [selectedFileName, setSelectedFileName] = useState("");

  useEffect(() => {
    if (!task || status !== "processing") {
      return;
    }
    pollingTaskId.current = task.taskId;
    let stopped = false;

    async function poll() {
      if (!pollingTaskId.current || stopped) {
        return;
      }
      try {
        const response = await fetch(`/api/generation-tasks/${pollingTaskId.current}`, { cache: "no-store" });
        const body = (await response.json()) as ApiResponse<TaskProgressResponse>;
        if (!body.ok) {
          setStatus("error");
          setMessage(body.error.message);
          return;
        }
        setProgress(body.data);
        setMessage(body.data.errorMessage ?? body.data.message);
        if (body.data.status === "completed") {
          setStatus("completed");
          router.push(`/editor/${body.data.resumeId}`);
          router.refresh();
          return;
        }
        if (body.data.status === "failed" || body.data.status === "cancelled") {
          setStatus("error");
          return;
        }
        window.setTimeout(poll, 1600);
      } catch {
        setStatus("error");
        setMessage("生成状态获取失败，请稍后重试。");
      }
    }

    void poll();
    return () => {
      stopped = true;
    };
  }, [router, status, task]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("uploading");
    setMessage("");
    setTask(null);
    setProgress(null);

    const formData = new FormData(event.currentTarget);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size <= 0) {
      setStatus("error");
      setMessage("请先选择要上传的简历文件。");
      return;
    }

    try {
      const response = await fetch("/api/resumes/upload", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json()) as ApiResponse<UploadResponse>;

      if (!body.ok) {
        setStatus("error");
        setMessage(body.error.message);
        return;
      }

      setTask(body.data);
      setStatus("processing");
      setMessage("已提交，等待处理");
    } catch {
      setStatus("error");
      setMessage("上传请求失败，请检查网络后重试。");
    }
  }

  async function cancelGeneration() {
    if (!task) {
      return;
    }
    try {
      const response = await fetch(`/api/generation-tasks/${task.taskId}`, {
        method: "DELETE",
        cache: "no-store",
      });
      const body = (await response.json()) as ApiResponse<TaskProgressResponse>;
      if (!body.ok) {
        setStatus("error");
        setMessage(body.error.message);
        return;
      }
      pollingTaskId.current = null;
      setProgress(body.data);
      setStatus("error");
      setMessage(body.data.errorMessage ?? body.data.message);
    } catch {
      setStatus("error");
      setMessage("终止请求失败，请稍后重试。");
    }
  }

  async function retryGeneration() {
    if (!task) {
      return;
    }
    setMessage("已重新提交，等待处理");
    try {
      const response = await fetch(`/api/generation-tasks/${task.taskId}/retry`, {
        method: "POST",
        cache: "no-store",
      });
      const body = (await response.json()) as ApiResponse<TaskProgressResponse>;
      if (!body.ok) {
        setStatus("error");
        setMessage(body.error.message);
        return;
      }
      setProgress(body.data);
      setMessage(body.data.message);
      setStatus("processing");
    } catch {
      setStatus("error");
      setMessage("重试请求失败，请稍后重试。");
    }
  }

  return (
    <>
      <form className="stack upload-form" onSubmit={handleSubmit}>
        <label>
          简历文件
          <input
            name="file"
            type="file"
            required
            accept=".doc,.docx,.pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              setSelectedFileName(file?.name ?? "");
              setMessage("");
            }}
          />
        </label>
        {selectedFileName ? <p className="muted upload-file-name">已选择：{selectedFileName}</p> : null}
        <button type="submit" disabled={status === "uploading" || status === "processing"}>
          {status === "uploading" ? "正在上传..." : status === "processing" ? "正在生成..." : "开始生成"}
        </button>
      </form>

      {progress ? (
        <section className="progress-panel" aria-live="polite">
          <div className="progress-heading">
            <div>
              <strong>{progress.message}</strong>
              <span>
                {progress.status === "completed" || progress.status === "failed" || progress.status === "cancelled"
                  ? progress.status === "completed"
                    ? "已完成"
                    : progress.status === "cancelled"
                      ? "已终止"
                      : "需要处理"
                  : `第 ${progress.stageIndex} / ${progress.stageCount} 步`}
              </span>
            </div>
            <span className={`status-badge ${progress.status}`}>{statusText(progress.status)}</span>
          </div>
          <div className="progress-track" aria-label={`生成进度 ${progress.progressPercent}%`}>
            <span style={{ width: `${progress.progressPercent}%` }} />
          </div>
          <ol className="step-list">
            {["排队", "解析", "AI 优化", "完成"].map((label, index) => (
              <li className={progress.stageIndex >= index + 1 ? "active" : ""} key={label}>
                {label}
              </li>
            ))}
          </ol>
          {progress.errorMessage ? <p className="form-message error">{progress.errorMessage}</p> : null}
          <div className="actions left">
            {progress.canCancel ? (
              <button type="button" className="secondary-button danger" onClick={cancelGeneration}>
                终止生成
              </button>
            ) : null}
            {progress.canRetry ? (
              <button type="button" onClick={retryGeneration}>
                重试生成
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {message ? <p className={`form-message ${status === "error" ? "error" : "success"}`}>{message}</p> : null}
      {status === "error" && message.includes("Authentication") ? (
        <p className="form-message error">
          请先 <Link href="/auth/login">登录</Link> 后再上传简历。
        </p>
      ) : null}
    </>
  );
}

function statusText(status: TaskProgressResponse["status"]): string {
  switch (status) {
    case "pending":
      return "排队中";
    case "parsing":
      return "解析中";
    case "ai_processing":
      return "生成中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "cancelled":
      return "已终止";
  }
}
