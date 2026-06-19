import { validateResumeContentAndLayout as validateSharedResumeContentAndLayout } from "../../types/resume";
import type { ConfirmationStatus, ResumeContent, ResumeLayout, ResumeSection, RichText } from "./types";
import { ResumeError } from "./types";

const SECTION_TYPES = new Set(["profile", "education", "work_experience", "project", "skill", "certificate", "honor", "custom"]);
const CONFIRMATION_STATUSES = new Set<ConfirmationStatus>(["pending", "confirmed", "edited", "dismissed"]);
const LAYOUT_VARIANTS = new Set(["standard", "timeline", "tag_group", "rich_text"]);
const SAFE_TAGS = new Set(["p", "br", "strong", "em", "u", "ul", "ol", "li", "a"]);

export function validateResumeContentAndLayout(content: ResumeContent, layout: ResumeLayout): void {
  const errors = collectResumeValidationErrors(content, layout);
  if (errors.length > 0) {
    throw new ResumeError("VALIDATION_ERROR", errors.join(" "));
  }
}

export function collectResumeValidationErrors(content: ResumeContent, layout: ResumeLayout): string[] {
  const errors: string[] = [];
  const sharedResult = validateSharedResumeContentAndLayout(content, layout);
  if (!sharedResult.success) {
    errors.push(...sharedResult.error.issues.map((issue) => issue.message));
  }

  if (!content || content.schemaVersion !== 1) {
    errors.push("ResumeContent.schemaVersion must be 1.");
  }
  if (!isNonEmptyString(content?.title)) {
    errors.push("ResumeContent.title is required.");
  }
  if (!Array.isArray(content?.sections)) {
    errors.push("ResumeContent.sections must be an array.");
  }
  if (!Array.isArray(content?.moduleOrder)) {
    errors.push("ResumeContent.moduleOrder must be an array.");
  }
  if (!Array.isArray(content?.assets)) {
    errors.push("ResumeContent.assets must be an array.");
  }
  if (!Array.isArray(content?.confirmationItems)) {
    errors.push("ResumeContent.confirmationItems must be an array.");
  }
  if (!layout || layout.schemaVersion !== 1) {
    errors.push("ResumeLayout.schemaVersion must be 1.");
  }
  if (layout?.template !== "default") {
    errors.push("ResumeLayout.template must be default.");
  }
  if (!layout?.theme || !["system", "serif"].includes(layout.theme.fontFamily)) {
    errors.push("ResumeLayout.theme.fontFamily is invalid.");
  }
  if (!layout?.theme || !["compact", "comfortable"].includes(layout.theme.density)) {
    errors.push("ResumeLayout.theme.density is invalid.");
  }
  if (!layout?.theme || !/^#[0-9A-Fa-f]{6}$/.test(layout.theme.accentColor)) {
    errors.push("ResumeLayout.theme.accentColor must be a hex color.");
  }

  if (!Array.isArray(content?.sections) || !Array.isArray(content?.moduleOrder) || !Array.isArray(layout?.sectionLayout)) {
    return errors;
  }

  const sectionIds = content.sections.map((section) => section.id);
  const uniqueSectionIds = new Set(sectionIds);
  if (sectionIds.length !== uniqueSectionIds.size) {
    errors.push("Resume sections must have unique IDs.");
  }

  for (const section of content.sections) {
    errors.push(...validateSection(section));
  }

  if (!sameStringSet(sectionIds, content.moduleOrder)) {
    errors.push("ResumeContent.moduleOrder must contain exactly every section ID.");
  }

  const layoutSectionIds = layout.sectionLayout.map((item) => item.sectionId);
  if (!sameStringSet(sectionIds, layoutSectionIds)) {
    errors.push("ResumeLayout.sectionLayout must contain exactly every section ID.");
  }
  for (const item of layout.sectionLayout) {
    if (!LAYOUT_VARIANTS.has(item.variant)) {
      errors.push(`Layout variant for section ${item.sectionId} is invalid.`);
    }
  }

  for (const asset of content.assets) {
    if (!isNonEmptyString(asset.id)) {
      errors.push("ResumeAsset.id is required.");
    }
    if (asset.kind !== "image") {
      errors.push(`ResumeAsset ${asset.id} has unsupported kind.`);
    }
    if (!isNonEmptyString(asset.mimeType) || !asset.mimeType.startsWith("image/")) {
      errors.push(`ResumeAsset ${asset.id} must use an image MIME type.`);
    }
    if (!isPersistentAssetRef(asset.dataRef)) {
      errors.push(`ResumeAsset ${asset.id} must not reference an original temporary upload path.`);
    }
  }

  for (const item of content.confirmationItems) {
    if (!isNonEmptyString(item.id)) {
      errors.push("ConfirmationItem.id is required.");
    }
    if (!isNonEmptyString(item.fieldPath)) {
      errors.push(`ConfirmationItem ${item.id} fieldPath is required.`);
    }
    if (!CONFIRMATION_STATUSES.has(item.status)) {
      errors.push(`ConfirmationItem ${item.id} status is invalid.`);
    }
    if (isNonEmptyString(item.fieldPath) && !pathExists(content, item.fieldPath)) {
      errors.push(`ConfirmationItem ${item.id} points to a missing field.`);
    }
  }

  return errors;
}

export function sanitizeResumeContent(content: ResumeContent): ResumeContent {
  return {
    ...content,
    sections: content.sections.map((section) => sanitizeSection(section)),
  };
}

export function updateConfirmationStatus(content: ResumeContent, itemId: string, status: ConfirmationStatus): ResumeContent {
  if (!CONFIRMATION_STATUSES.has(status)) {
    throw new ResumeError("VALIDATION_ERROR", "Confirmation status is invalid.");
  }
  let found = false;
  const confirmationItems = content.confirmationItems.map((item) => {
    if (item.id !== itemId) {
      return item;
    }
    found = true;
    return { ...item, status };
  });
  if (!found) {
    throw new ResumeError("VALIDATION_ERROR", "Confirmation item does not exist.");
  }
  return { ...content, confirmationItems };
}

function validateSection(section: ResumeSection): string[] {
  const errors: string[] = [];
  if (!isNonEmptyString(section.id)) {
    errors.push("ResumeSection.id is required.");
  }
  if (!SECTION_TYPES.has(section.type)) {
    errors.push(`ResumeSection ${section.id} has unsupported type.`);
  }
  if (!isNonEmptyString(section.title)) {
    errors.push(`ResumeSection ${section.id} title is required.`);
  }
  if (typeof section.visible !== "boolean") {
    errors.push(`ResumeSection ${section.id} visible must be boolean.`);
  }
  return errors;
}

function sanitizeSection(section: ResumeSection): ResumeSection {
  switch (section.type) {
    case "profile":
      return {
        ...section,
        data: {
          ...section.data,
          summary: sanitizeOptionalRichText(section.data.summary),
        },
      };
    case "education":
    case "work_experience":
    case "project":
    case "certificate":
    case "honor":
      return {
        ...section,
        items: section.items.map((item) => ({
          ...item,
          description: sanitizeOptionalRichText(item.description),
        })),
      } as ResumeSection;
    case "custom":
      return { ...section, content: sanitizeRichText(section.content) };
    case "skill":
      return section;
  }
}

function sanitizeOptionalRichText(richText: RichText | undefined): RichText | undefined {
  return richText ? sanitizeRichText(richText) : undefined;
}

function sanitizeRichText(richText: RichText): RichText {
  return {
    ...richText,
    html: sanitizeHtml(richText.html),
  };
}

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/<\s*\/?\s*([a-zA-Z0-9-]+)([^>]*)>/g, (match, tagName: string, attributes: string) => {
      const tag = tagName.toLowerCase();
      if (!SAFE_TAGS.has(tag)) {
        return "";
      }
      if (tag !== "a" || match.startsWith("</")) {
        return match.startsWith("</") ? `</${tag}>` : `<${tag}>`;
      }
      const hrefMatch = attributes.match(/\shref=(["'])(.*?)\1/i);
      const href = hrefMatch?.[2] ?? "";
      if (!/^(https?:|mailto:)/i.test(href)) {
        return "<a>";
      }
      return `<a href="${escapeAttribute(href)}">`;
    });
}

function isPersistentAssetRef(dataRef: string): boolean {
  if (!isNonEmptyString(dataRef)) {
    return false;
  }
  const normalized = dataRef.toLowerCase();
  return (
    !normalized.startsWith("file:") &&
    !normalized.includes("/tmp/") &&
    !normalized.includes("\\tmp\\") &&
    !normalized.includes("temp_upload_root") &&
    !normalized.includes("/uploads/") &&
    !normalized.includes("\\uploads\\") &&
    !normalized.includes("original.")
  );
}

function pathExists(root: unknown, path: string): boolean {
  const normalized = path.replace(/\[(\d+)\]/g, ".$1");
  const parts = normalized.split(".").filter(Boolean);
  let current: unknown = root;
  for (const part of parts) {
    if (current === null || current === undefined) {
      return false;
    }
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return false;
      }
      current = current[index];
      continue;
    }
    if (typeof current !== "object" || !(part in current)) {
      return false;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return true;
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const leftSet = new Set(left);
  return right.every((value) => leftSet.has(value)) && new Set(right).size === right.length;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
