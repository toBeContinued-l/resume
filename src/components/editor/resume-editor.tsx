"use client";

import React, { useMemo, useState } from "react";
import type { ConfirmationItem, ResumeContent, ResumeLayout, ResumeSection } from "@/types/resume";
import { ResumePreview } from "@/components/resume/resume-preview";
import {
  addSection,
  applyEditorChange,
  createEditorState,
  deleteSection,
  moveSection,
  redoEditorChange,
  toRichText,
  undoEditorChange,
  updateConfirmationItem,
  updateSection,
  type EditorState,
} from "./resume-editor-state";
import { RichTextEditor } from "./rich-text-editor";
import styles from "./resume-editor.module.css";

type ResumeEditorProps = {
  resumeId: string;
  initialContent: ResumeContent;
  initialLayout: ResumeLayout;
  initialAccessMode?: "public" | "private_link" | "password";
};

type SaveState = "idle" | "saving" | "saved" | "error";
type EducationItem = Extract<ResumeSection, { type: "education" }>["items"][number];
type WorkItem = Extract<ResumeSection, { type: "work_experience" }>["items"][number];
type ProjectItem = Extract<ResumeSection, { type: "project" }>["items"][number];
type IssuedItem = Extract<ResumeSection, { type: "certificate" | "honor" }>["items"][number];

export function ResumeEditor({ resumeId, initialContent, initialLayout, initialAccessMode }: ResumeEditorProps) {
  const [state, setState] = useState<EditorState>(() => createEditorState(initialContent, initialLayout));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [accessMode, setAccessMode] = useState(initialAccessMode ?? "private_link");
  const [password, setPassword] = useState("");
  const orderedSections = useMemo(
    () =>
      state.content.moduleOrder
        .map((id) => state.content.sections.find((section) => section.id === id))
        .filter((section): section is ResumeSection => Boolean(section)),
    [state.content.moduleOrder, state.content.sections],
  );

  return (
    <main className={`app-shell ${styles.editorShell}`}>
      <div className={styles.toolbar}>
        <button type="button" onClick={() => setState((current) => undoEditorChange(current))} disabled={state.past.length === 0}>
          撤销
        </button>
        <button type="button" onClick={() => setState((current) => redoEditorChange(current))} disabled={state.future.length === 0}>
          重做
        </button>
        <button type="button" onClick={saveResume} disabled={saveState === "saving"}>
          保存
        </button>
        <span className={styles.statusLine}>{statusText(saveState)}</span>
      </div>

      <div className={styles.editorGrid}>
        <section className={`${styles.panel} ${styles.stack}`} aria-label="简历编辑器">
          <label>
            简历标题
            <input
              value={state.content.title}
              onChange={(event) =>
                change((snapshot) => ({
                  ...snapshot,
                  content: { ...snapshot.content, title: event.target.value },
                }))
              }
            />
          </label>

          <div className={styles.actions}>
            <select aria-label="新增模块类型" id="section-type">
              <option value="profile">个人信息</option>
              <option value="education">教育经历</option>
              <option value="work_experience">工作经历</option>
              <option value="project">项目经历</option>
              <option value="skill">技能</option>
              <option value="certificate">证书</option>
              <option value="honor">荣誉</option>
              <option value="custom">自定义模块</option>
            </select>
            <button
              type="button"
              onClick={() => {
                const select = document.getElementById("section-type") as HTMLSelectElement | null;
                change((snapshot) => addSection(snapshot, (select?.value ?? "custom") as ResumeSection["type"]));
              }}
            >
              新增模块
            </button>
          </div>

          {state.content.confirmationItems.length > 0 ? (
            <ConfirmationItems
              items={state.content.confirmationItems}
              onChange={(itemId, status) => change((snapshot) => updateConfirmationItem(snapshot, itemId, status))}
            />
          ) : null}

          {orderedSections.map((section) => (
            <SectionEditor
              key={section.id}
              section={section}
              onMove={(direction) => change((snapshot) => moveSection(snapshot, section.id, direction))}
              onDelete={() => change((snapshot) => deleteSection(snapshot, section.id))}
              onUpdate={(updater) => change((snapshot) => updateSection(snapshot, section.id, updater))}
            />
          ))}

          <section className={styles.sectionCard} aria-label="在线链接配置">
            <h2>在线链接</h2>
            <label>
              访问模式
              <select value={accessMode} onChange={(event) => setAccessMode(event.target.value as typeof accessMode)}>
                <option value="public">公开访问</option>
                <option value="private_link">私密链接</option>
                <option value="password">密码访问</option>
              </select>
            </label>
            <label>
              访问密码
              <input value={password} type="password" onChange={(event) => setPassword(event.target.value)} />
            </label>
            <button type="button" onClick={publishLink}>
              发布或更新链接
            </button>
          </section>
        </section>

        <ResumePreview content={state.content} />
      </div>
    </main>
  );

  function change(updater: (snapshot: { content: ResumeContent; layout: ResumeLayout }) => { content: ResumeContent; layout: ResumeLayout }) {
    setState((current) => applyEditorChange(current, updater));
    setSaveState("idle");
  }

  async function saveResume() {
    setSaveState("saving");
    const response = await fetch(`/api/resumes/${resumeId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: state.content, layout: state.layout }),
    });
    setSaveState(response.ok ? "saved" : "error");
  }

  async function publishLink() {
    setSaveState("saving");
    const response = await fetch(`/api/resumes/${resumeId}/link`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessMode, password }),
    });
    setSaveState(response.ok ? "saved" : "error");
  }
}

function SectionEditor({
  section,
  onMove,
  onDelete,
  onUpdate,
}: {
  section: ResumeSection;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onUpdate: (updater: (section: ResumeSection) => ResumeSection) => void;
}) {
  return (
    <section className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <label>
          模块标题
          <input value={section.title} onChange={(event) => onUpdate((current) => ({ ...current, title: event.target.value }))} />
        </label>
        <div className={styles.actions}>
          <button type="button" onClick={() => onMove(-1)} aria-label={`${section.title} 上移`}>
            ↑
          </button>
          <button type="button" onClick={() => onMove(1)} aria-label={`${section.title} 下移`}>
            ↓
          </button>
          <button type="button" onClick={onDelete}>
            删除
          </button>
        </div>
      </div>
      <label>
        <input
          type="checkbox"
          checked={section.visible}
          onChange={(event) => onUpdate((current) => ({ ...current, visible: event.target.checked }))}
        />
        显示模块
      </label>
      <SectionFields section={section} onUpdate={onUpdate} />
    </section>
  );
}

function SectionFields({
  section,
  onUpdate,
}: {
  section: ResumeSection;
  onUpdate: (updater: (section: ResumeSection) => ResumeSection) => void;
}) {
  switch (section.type) {
    case "profile":
      return (
        <div className={styles.stack}>
          <div className={styles.inlineFields}>
            {(["name", "headline", "email", "phone", "location"] as const).map((field) => (
              <label key={field}>
                {profileLabel(field)}
                <input
                  value={section.data[field] ?? ""}
                  onChange={(event) =>
                    onUpdate((current) =>
                      current.type === "profile"
                        ? { ...current, data: { ...current.data, [field]: event.target.value } }
                        : current,
                    )
                  }
                />
              </label>
            ))}
          </div>
          <RichTextEditor
            label="个人摘要"
            value={section.data.summary}
            onChange={(summary) =>
              onUpdate((current) => (current.type === "profile" ? { ...current, data: { ...current.data, summary } } : current))
            }
          />
        </div>
      );
    case "custom":
      return <RichTextEditor label="模块内容" value={section.content} onChange={(content) => onUpdate((current) => (current.type === "custom" ? { ...current, content } : current))} />;
    case "skill":
      return (
        <textarea
          aria-label={`${section.title} 技能`}
          value={section.groups.flatMap((group) => group.skills).join(", ")}
          onChange={(event) =>
            onUpdate((current) =>
              current.type === "skill"
                ? {
                    ...current,
                    groups: [{ id: current.groups[0]?.id ?? "skills", name: current.groups[0]?.name ?? "技能", skills: event.target.value.split(",").map((skill) => skill.trim()).filter(Boolean) }],
                  }
                : current,
            )
          }
        />
      );
    case "education":
      return (
        <div className={styles.stack}>
          {section.items.map((item, index) => (
            <div className={styles.stack} key={item.id}>
              <div className={styles.inlineFields}>
                <TextField label={`${section.title} 学校 ${index + 1}`} value={item.school} onChange={(school) => updateEducationItem(item.id, { school })} />
                <TextField label={`${section.title} 学位 ${index + 1}`} value={item.degree} onChange={(degree) => updateEducationItem(item.id, { degree })} />
                <TextField label={`${section.title} 专业 ${index + 1}`} value={item.major} onChange={(major) => updateEducationItem(item.id, { major })} />
                <TextField label={`${section.title} 开始时间 ${index + 1}`} value={item.startDate} onChange={(startDate) => updateEducationItem(item.id, { startDate })} />
                <TextField label={`${section.title} 结束时间 ${index + 1}`} value={item.endDate} onChange={(endDate) => updateEducationItem(item.id, { endDate })} />
              </div>
              <RichTextEditor label={`${section.title} 描述 ${index + 1}`} value={item.description} onChange={(description) => updateEducationItem(item.id, { description })} />
            </div>
          ))}
          <AddItemButton onClick={() => onUpdate((current) => (current.type === "education" ? { ...current, items: [...current.items, createEmptyItem("education", createItemId("education"))] } : current))} />
        </div>
      );
    case "work_experience":
      return (
        <div className={styles.stack}>
          {section.items.map((item, index) => (
            <div className={styles.stack} key={item.id}>
              <div className={styles.inlineFields}>
                <TextField label={`${section.title} 公司 ${index + 1}`} value={item.company} onChange={(company) => updateWorkItem(item.id, { company })} />
                <TextField label={`${section.title} 职位 ${index + 1}`} value={item.role} onChange={(role) => updateWorkItem(item.id, { role })} />
                <TextField label={`${section.title} 开始时间 ${index + 1}`} value={item.startDate} onChange={(startDate) => updateWorkItem(item.id, { startDate })} />
                <TextField label={`${section.title} 结束时间 ${index + 1}`} value={item.endDate} onChange={(endDate) => updateWorkItem(item.id, { endDate })} />
              </div>
              <RichTextEditor label={`${section.title} 描述 ${index + 1}`} value={item.description} onChange={(description) => updateWorkItem(item.id, { description })} />
            </div>
          ))}
          <AddItemButton onClick={() => onUpdate((current) => (current.type === "work_experience" ? { ...current, items: [...current.items, createEmptyItem("work_experience", createItemId("work_experience"))] } : current))} />
        </div>
      );
    case "project":
      return (
        <div className={styles.stack}>
          {section.items.map((item, index) => (
            <div className={styles.stack} key={item.id}>
              <div className={styles.inlineFields}>
                <TextField label={`${section.title} 项目名称 ${index + 1}`} value={item.name} onChange={(name) => updateProjectItem(item.id, { name })} />
                <TextField label={`${section.title} 角色 ${index + 1}`} value={item.role} onChange={(role) => updateProjectItem(item.id, { role })} />
                <TextField label={`${section.title} 开始时间 ${index + 1}`} value={item.startDate} onChange={(startDate) => updateProjectItem(item.id, { startDate })} />
                <TextField label={`${section.title} 结束时间 ${index + 1}`} value={item.endDate} onChange={(endDate) => updateProjectItem(item.id, { endDate })} />
              </div>
              <RichTextEditor label={`${section.title} 描述 ${index + 1}`} value={item.description} onChange={(description) => updateProjectItem(item.id, { description })} />
            </div>
          ))}
          <AddItemButton onClick={() => onUpdate((current) => (current.type === "project" ? { ...current, items: [...current.items, createEmptyItem("project", createItemId("project"))] } : current))} />
        </div>
      );
    case "certificate":
    case "honor":
      return (
        <div className={styles.stack}>
          {section.items.map((item, index) => (
            <div className={styles.stack} key={item.id}>
              <div className={styles.inlineFields}>
                <TextField label={`${section.title} 名称 ${index + 1}`} value={item.name} onChange={(name) => updateIssuedItem(section.type, item.id, { name })} />
                <TextField label={`${section.title} 颁发方 ${index + 1}`} value={item.issuer} onChange={(issuer) => updateIssuedItem(section.type, item.id, { issuer })} />
                <TextField label={`${section.title} 颁发时间 ${index + 1}`} value={item.issuedAt} onChange={(issuedAt) => updateIssuedItem(section.type, item.id, { issuedAt })} />
              </div>
              <RichTextEditor label={`${section.title} 描述 ${index + 1}`} value={item.description} onChange={(description) => updateIssuedItem(section.type, item.id, { description })} />
            </div>
          ))}
          <AddItemButton onClick={() => onUpdate((current) => (current.type === section.type ? { ...current, items: [...current.items, createEmptyItem(current.type, createItemId(current.type))] } : current))} />
        </div>
      );
  }

  function updateEducationItem(itemId: string, patch: Partial<EducationItem>) {
    onUpdate((current) => (current.type === "education" ? { ...current, items: updateItem(current.items, itemId, patch) } : current));
  }

  function updateWorkItem(itemId: string, patch: Partial<WorkItem>) {
    onUpdate((current) => (current.type === "work_experience" ? { ...current, items: updateItem(current.items, itemId, patch) } : current));
  }

  function updateProjectItem(itemId: string, patch: Partial<ProjectItem>) {
    onUpdate((current) => (current.type === "project" ? { ...current, items: updateItem(current.items, itemId, patch) } : current));
  }

  function updateIssuedItem(type: "certificate" | "honor", itemId: string, patch: Partial<IssuedItem>) {
    onUpdate((current) => (current.type === type ? { ...current, items: updateItem(current.items, itemId, patch) } : current));
  }
}

function TextField({ label, value, onChange }: { label: string; value: string | undefined; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <input value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function AddItemButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}>
      添加条目
    </button>
  );
}

function ConfirmationItems({
  items,
  onChange,
}: {
  items: ConfirmationItem[];
  onChange: (itemId: string, status: ConfirmationItem["status"]) => void;
}) {
  return (
    <section className={styles.confirmationList} aria-label="待确认项">
      <h2>待确认项</h2>
      {items.map((item) => (
        <article className={styles.confirmationItem} key={item.id}>
          <p>{item.message}</p>
          <p className="muted">{item.status}</p>
          <div className={styles.actions}>
            <button type="button" onClick={() => onChange(item.id, "confirmed")}>
              确认
            </button>
            <button type="button" onClick={() => onChange(item.id, "edited")}>
              编辑后确认
            </button>
            <button type="button" onClick={() => onChange(item.id, "dismissed")}>
              忽略
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}

function profileLabel(field: "name" | "headline" | "email" | "phone" | "location") {
  return {
    name: "姓名",
    headline: "标题",
    email: "邮箱",
    phone: "电话",
    location: "所在地",
  }[field];
}

function statusText(status: SaveState) {
  return {
    idle: "",
    saving: "保存中",
    saved: "已保存",
    error: "保存失败",
  }[status];
}

function updateItem<T extends { id: string }>(items: T[], itemId: string, patch: Partial<T>): T[] {
  return items.map((item) => (item.id === itemId ? { ...item, ...patch } : item));
}

function createEmptyItem(type: Exclude<ResumeSection["type"], "profile" | "skill" | "custom">, id: string) {
  const description = toRichText("<p></p>");
  if (type === "education") {
    return { id, school: "", degree: "", major: "", description };
  }
  if (type === "work_experience") {
    return { id, company: "", role: "", description };
  }
  if (type === "project") {
    return { id, name: "", role: "", links: [], description };
  }
  return { id, name: "", issuer: "", description };
}

function createItemId(type: string): string {
  return `${type}-${Date.now().toString(36)}`;
}
