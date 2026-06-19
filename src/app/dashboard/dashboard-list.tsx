"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type ResumeSummary = {
  id: string;
  title: string;
  status: "generating" | "draft" | "published" | "failed" | "cancelled";
  createdAt: Date;
  updatedAt: Date;
  link: { slug: string; accessMode: "public" | "private_link" | "password"; isActive: boolean } | null;
};

type DashboardListProps = {
  summaries: ResumeSummary[];
};

export function DashboardList({ summaries }: DashboardListProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const { activeSummaries, archivedSummaries } = useMemo(() => {
    return {
      activeSummaries: summaries.filter((resume) => resume.status !== "failed" && resume.status !== "cancelled"),
      archivedSummaries: summaries.filter((resume) => resume.status === "failed" || resume.status === "cancelled"),
    };
  }, [summaries]);

  async function handleDelete(resumeId: string) {
    setDeletingId(resumeId);
    setMessage("");

    try {
      const response = await fetch(`/api/resumes/${resumeId}`, {
        method: "DELETE",
      });

      if (!response.ok && response.status !== 204) {
        setMessage("删除失败，请稍后重试。");
        return;
      }

      router.refresh();
    } catch {
      setMessage("删除失败，请稍后重试。");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="list">
      {activeSummaries.length === 0 && archivedSummaries.length === 0 ? <p className="muted">还没有生成过简历。</p> : null}

      {activeSummaries.map((resume) => (
        <article className="list-item resume-list-item" key={resume.id}>
          <div>
            <h2>{resume.title}</h2>
            <p className="muted">更新于 {formatDateTime(resume.updatedAt)}</p>
            <span className={`status-badge ${resume.status}`}>{resumeStatusText(resume.status)}</span>
          </div>
          <div className="actions dashboard-actions">
            {resume.status === "draft" || resume.status === "published" ? (
              <Link className="button-link secondary" href={`/editor/${resume.id}`}>编辑</Link>
            ) : null}
            {resume.status === "generating" ? (
              <Link className="button-link secondary" href="/resumes/upload">查看生成</Link>
            ) : null}
            {resume.link?.isActive ? <Link href={`/r/${resume.link.slug}`}>在线链接</Link> : null}
            <button
              type="button"
              className="secondary-button danger"
              disabled={deletingId === resume.id}
              onClick={() => {
                void handleDelete(resume.id);
              }}
            >
              {deletingId === resume.id ? "删除中..." : "删除"}
            </button>
          </div>
        </article>
      ))}

      {archivedSummaries.length > 0 ? (
        <section className="history-subsection">
          <div className="history-subsection-header">
            <h2>失败与已终止记录</h2>
            <p className="muted">这些记录不占用上传次数，建议删除无用项，保持历史区整洁。</p>
          </div>
          <div className="list compact-list">
            {archivedSummaries.map((resume) => (
              <article className="list-item resume-list-item compact" key={resume.id}>
                <div>
                  <h3>{resume.title}</h3>
                  <p className="muted">更新于 {formatDateTime(resume.updatedAt)}</p>
                  <span className={`status-badge ${resume.status}`}>{resumeStatusText(resume.status)}</span>
                </div>
                <div className="actions dashboard-actions">
                  <Link className="button-link secondary" href="/resumes/upload">
                    {resume.status === "failed" ? "重试上传" : "重新上传"}
                  </Link>
                  <button
                    type="button"
                    className="secondary-button danger"
                    disabled={deletingId === resume.id}
                    onClick={() => {
                      void handleDelete(resume.id);
                    }}
                  >
                    {deletingId === resume.id ? "删除中..." : "删除"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {message ? <p className="form-message error">{message}</p> : null}
    </div>
  );
}

function resumeStatusText(status: ResumeSummary["status"]): string {
  switch (status) {
    case "generating":
      return "生成中";
    case "draft":
      return "草稿";
    case "published":
      return "已发布";
    case "failed":
      return "生成失败";
    case "cancelled":
      return "已终止";
  }
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
