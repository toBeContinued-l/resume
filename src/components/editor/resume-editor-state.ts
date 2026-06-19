import type {
  ConfirmationItem,
  ResumeContent,
  ResumeLayout,
  ResumeSection,
  RichText,
} from "@/types/resume";

export type EditorSnapshot = {
  content: ResumeContent;
  layout: ResumeLayout;
};

export type EditorState = EditorSnapshot & {
  past: EditorSnapshot[];
  future: EditorSnapshot[];
};

type SectionType = ResumeSection["type"];

export function createEditorState(content: ResumeContent, layout: ResumeLayout): EditorState {
  return { content, layout, past: [], future: [] };
}

export function applyEditorChange(
  state: EditorState,
  change: (snapshot: EditorSnapshot) => EditorSnapshot,
): EditorState {
  const next = normalizeSnapshot(change({ content: state.content, layout: state.layout }));
  return {
    ...next,
    past: [...state.past, { content: state.content, layout: state.layout }],
    future: [],
  };
}

export function undoEditorChange(state: EditorState): EditorState {
  const previous = state.past.at(-1);
  if (!previous) {
    return state;
  }
  return {
    ...previous,
    past: state.past.slice(0, -1),
    future: [{ content: state.content, layout: state.layout }, ...state.future],
  };
}

export function redoEditorChange(state: EditorState): EditorState {
  const next = state.future[0];
  if (!next) {
    return state;
  }
  return {
    ...next,
    past: [...state.past, { content: state.content, layout: state.layout }],
    future: state.future.slice(1),
  };
}

export function updateSection(
  snapshot: EditorSnapshot,
  sectionId: string,
  updater: (section: ResumeSection) => ResumeSection,
): EditorSnapshot {
  return {
    ...snapshot,
    content: {
      ...snapshot.content,
      sections: snapshot.content.sections.map((section) => (section.id === sectionId ? updater(section) : section)),
    },
  };
}

export function addSection(snapshot: EditorSnapshot, type: SectionType, id = createLocalId(type)): EditorSnapshot {
  const section = createEmptySection(type, id);
  return normalizeSnapshot({
    content: {
      ...snapshot.content,
      sections: [...snapshot.content.sections, section],
      moduleOrder: [...snapshot.content.moduleOrder, section.id],
    },
    layout: {
      ...snapshot.layout,
      sectionLayout: [...snapshot.layout.sectionLayout, { sectionId: section.id, variant: defaultVariant(type) }],
    },
  });
}

export function deleteSection(snapshot: EditorSnapshot, sectionId: string): EditorSnapshot {
  return normalizeSnapshot({
    content: {
      ...snapshot.content,
      sections: snapshot.content.sections.filter((section) => section.id !== sectionId),
      moduleOrder: snapshot.content.moduleOrder.filter((id) => id !== sectionId),
      confirmationItems: snapshot.content.confirmationItems.filter((item) => !item.fieldPath.includes(sectionId)),
    },
    layout: {
      ...snapshot.layout,
      sectionLayout: snapshot.layout.sectionLayout.filter((item) => item.sectionId !== sectionId),
    },
  });
}

export function moveSection(snapshot: EditorSnapshot, sectionId: string, direction: -1 | 1): EditorSnapshot {
  const index = snapshot.content.moduleOrder.indexOf(sectionId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= snapshot.content.moduleOrder.length) {
    return snapshot;
  }
  const moduleOrder = [...snapshot.content.moduleOrder];
  [moduleOrder[index], moduleOrder[nextIndex]] = [moduleOrder[nextIndex], moduleOrder[index]];
  return normalizeSnapshot({
    ...snapshot,
    content: { ...snapshot.content, moduleOrder },
  });
}

export function updateConfirmationItem(
  snapshot: EditorSnapshot,
  itemId: string,
  status: ConfirmationItem["status"],
): EditorSnapshot {
  return {
    ...snapshot,
    content: {
      ...snapshot.content,
      confirmationItems: snapshot.content.confirmationItems.map((item) =>
        item.id === itemId ? { ...item, status } : item,
      ),
    },
  };
}

export function toRichText(html: string): RichText {
  const plainText = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { format: "html", html: sanitizeEditableHtml(html), plainText };
}

export function sanitizeEditableHtml(html: string): string {
  if (typeof document === "undefined") {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/\son\w+=(["']).*?\1/gi, "")
      .replace(/javascript:/gi, "");
  }

  const template = document.createElement("template");
  template.innerHTML = html;
  cleanNode(template.content);
  return template.innerHTML;
}

function normalizeSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  const sectionIds = snapshot.content.sections.map((section) => section.id);
  const orderedKnownIds = snapshot.content.moduleOrder.filter((id) => sectionIds.includes(id));
  const missingIds = sectionIds.filter((id) => !orderedKnownIds.includes(id));
  const moduleOrder = [...orderedKnownIds, ...missingIds];
  const existingLayouts = new Map(snapshot.layout.sectionLayout.map((item) => [item.sectionId, item.variant]));

  return {
    content: { ...snapshot.content, moduleOrder },
    layout: {
      ...snapshot.layout,
      sectionLayout: moduleOrder.map((sectionId) => {
        const section = snapshot.content.sections.find((item) => item.id === sectionId);
        return { sectionId, variant: existingLayouts.get(sectionId) ?? defaultVariant(section?.type ?? "custom") };
      }),
    },
  };
}

function createEmptySection(type: SectionType, id: string): ResumeSection {
  const base = { id, title: defaultTitle(type), visible: true };
  switch (type) {
    case "profile":
      return { ...base, type, data: { name: "", headline: "", email: "", phone: "", location: "", links: [] } };
    case "education":
      return { ...base, type, items: [] };
    case "work_experience":
      return { ...base, type, items: [] };
    case "project":
      return { ...base, type, items: [] };
    case "skill":
      return { ...base, type, groups: [] };
    case "certificate":
      return { ...base, type, items: [] };
    case "honor":
      return { ...base, type, items: [] };
    case "custom":
      return { ...base, type, content: toRichText("<p></p>") };
  }
}

function defaultVariant(type: SectionType): ResumeLayout["sectionLayout"][number]["variant"] {
  if (type === "skill") {
    return "tag_group";
  }
  if (type === "custom") {
    return "rich_text";
  }
  if (type === "education" || type === "work_experience") {
    return "timeline";
  }
  return "standard";
}

function defaultTitle(type: SectionType): string {
  const titles: Record<SectionType, string> = {
    profile: "个人信息",
    education: "教育经历",
    work_experience: "工作经历",
    project: "项目经历",
    skill: "技能",
    certificate: "证书",
    honor: "荣誉",
    custom: "自定义模块",
  };
  return titles[type];
}

function createLocalId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function cleanNode(parent: ParentNode): void {
  const allowedTags = new Set(["P", "BR", "STRONG", "B", "EM", "I", "UL", "OL", "LI", "A"]);
  for (const node of [...parent.childNodes]) {
    if (node.nodeType === Node.COMMENT_NODE) {
      node.remove();
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }

    const element = node as HTMLElement;
    if (element.tagName === "SCRIPT" || element.tagName === "STYLE") {
      element.remove();
      continue;
    }
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      cleanNode(parent);
      continue;
    }

    const href = element.tagName === "A" ? element.getAttribute("href") ?? "" : "";
    for (const attribute of [...element.attributes]) {
      element.removeAttribute(attribute.name);
    }
    if (element.tagName === "A") {
      if (/^(https?:|mailto:)/i.test(href)) {
        element.setAttribute("href", href);
      }
    }
    if (element.tagName === "B") {
      element.replaceWith(wrapChildren(document.createElement("strong"), element));
      continue;
    }
    if (element.tagName === "I") {
      element.replaceWith(wrapChildren(document.createElement("em"), element));
      continue;
    }
    cleanNode(element);
  }
}

function wrapChildren(target: HTMLElement, source: HTMLElement): HTMLElement {
  target.append(...Array.from(source.childNodes));
  return target;
}
