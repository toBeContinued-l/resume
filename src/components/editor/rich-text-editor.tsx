"use client";

import React, { useEffect, useRef } from "react";
import type { RichText } from "@/types/resume";
import { sanitizeEditableHtml, toRichText } from "./resume-editor-state";
import styles from "./resume-editor.module.css";

type RichTextEditorProps = {
  label: string;
  value: RichText | undefined;
  onChange: (value: RichText) => void;
};

export function RichTextEditor({ label, value, onChange }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const html = value?.html ?? "<p></p>";

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== html) {
      editorRef.current.innerHTML = html;
    }
  }, [html]);

  return (
    <div className={styles.richTextField}>
      <div className={styles.fieldHeader}>
        <span>{label}</span>
        <div className={styles.toolbar} aria-label={`${label} 富文本工具栏`}>
          <button type="button" onClick={() => applyCommand("bold")} aria-label="加粗">
            B
          </button>
          <button type="button" onClick={() => applyCommand("insertUnorderedList")} aria-label="无序列表">
            •
          </button>
          <button type="button" onClick={() => applyCommand("insertOrderedList")} aria-label="有序列表">
            1.
          </button>
          <button
            type="button"
            onClick={() => {
              const href = window.prompt("链接地址");
              if (href) {
                applyCommand("createLink", href);
                emitChange();
              }
            }}
            aria-label="添加链接"
          >
            ↗
          </button>
        </div>
      </div>
      <div
        ref={editorRef}
        className={styles.richText}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label={label}
        onInput={emitChange}
        onBlur={emitChange}
      />
    </div>
  );

  function emitChange() {
    if (!editorRef.current) {
      return;
    }
    const cleaned = sanitizeEditableHtml(editorRef.current.innerHTML);
    if (cleaned !== editorRef.current.innerHTML) {
      editorRef.current.innerHTML = cleaned;
    }
    onChange(toRichText(cleaned));
  }
}

function applyCommand(command: string, value?: string) {
  document.execCommand(command, false, value);
}
