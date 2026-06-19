import React from "react";
import type { ResumeContent, ResumeSection } from "@/types/resume";

export function ResumePreview({ content }: { content: ResumeContent }) {
  const sections = content.moduleOrder
    .map((id) => content.sections.find((section) => section.id === id))
    .filter((section): section is ResumeSection => Boolean(section));

  return (
    <article className="preview" aria-label="简历预览">
      <h2>{content.title}</h2>
      {sections
        .filter((section) => section.visible)
        .map((section) => (
          <section key={section.id} className="preview-section">
            <h3>{section.title}</h3>
            <PreviewSection section={section} />
          </section>
        ))}
    </article>
  );
}

function PreviewSection({ section }: { section: ResumeSection }) {
  switch (section.type) {
    case "profile":
      return (
        <div>
          <p>{[section.data.name, section.data.headline, section.data.email, section.data.phone, section.data.location].filter(Boolean).join(" / ")}</p>
          {section.data.summary ? <div dangerouslySetInnerHTML={sanitizeHtml(section.data.summary.html)} /> : null}
        </div>
      );
    case "skill":
      return (
        <div className="skill-preview">
          {section.groups.map((group) => (
            <p key={group.id}>
              <strong>{group.name}</strong> {group.skills.join(" · ")}
            </p>
          ))}
        </div>
      );
    case "custom":
      return <div dangerouslySetInnerHTML={sanitizeHtml(section.content.html)} />;
    default:
      return (
        <div>
          {section.items.map((item) => (
            <div key={item.id} className="preview-item">
              <p>{itemTitle(item)}</p>
              {"description" in item && item.description ? <div dangerouslySetInnerHTML={sanitizeHtml(item.description.html)} /> : null}
            </div>
          ))}
        </div>
      );
  }
}

function sanitizeHtml(html: string): { __html: string } {
  const safeTags = new Set(["p", "br", "strong", "em", "u", "ul", "ol", "li", "a"]);
  return {
    __html: html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/\son\w+=(["']).*?\1/gi, "")
      .replace(/\son\w+=([^\s>]+)/gi, "")
      .replace(/<\s*\/?\s*([a-zA-Z0-9-]+)([^>]*)>/g, (match, tagName: string, attributes: string) => {
        const tag = tagName.toLowerCase();
        if (!safeTags.has(tag)) {
          return "";
        }
        if (match.startsWith("</")) {
          return `</${tag}>`;
        }
        if (tag !== "a") {
          return `<${tag}>`;
        }
        const hrefMatch = attributes.match(/\shref=(["'])(.*?)\1/i);
        const href = hrefMatch?.[2] ?? "";
        if (!/^(https?:|mailto:)/i.test(href)) {
          return "<a>";
        }
        return `<a href="${escapeAttribute(href)}">`;
      }),
  };
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function itemTitle(item: Record<string, unknown>): string {
  return [
    item.school,
    item.degree,
    item.major,
    item.company,
    item.role,
    item.name,
    item.issuer,
    item.startDate,
    item.endDate,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" / ");
}
