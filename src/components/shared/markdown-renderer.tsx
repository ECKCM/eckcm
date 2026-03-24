"use client";

import { useTheme } from "next-themes";
import dynamic from "next/dynamic";

const MarkdownPreview = dynamic(
  () => import("@uiw/react-markdown-preview").then((mod) => mod.default),
  { ssr: false }
);

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const { resolvedTheme } = useTheme();
  const colorMode = resolvedTheme === "dark" ? "dark" : "light";

  return (
    <div data-color-mode={colorMode} className={className}>
      <MarkdownPreview source={content} />
    </div>
  );
}
