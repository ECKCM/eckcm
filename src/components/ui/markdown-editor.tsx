"use client";

import { useTheme } from "next-themes";
import dynamic from "next/dynamic";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: number;
  placeholder?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  height = 400,
  placeholder,
}: MarkdownEditorProps) {
  const { resolvedTheme } = useTheme();
  const colorMode = resolvedTheme === "dark" ? "dark" : "light";

  return (
    <div data-color-mode={colorMode}>
      <MDEditor
        value={value}
        onChange={(val) => onChange(val ?? "")}
        height={height}
        preview="live"
        textareaProps={{ placeholder }}
      />
    </div>
  );
}
