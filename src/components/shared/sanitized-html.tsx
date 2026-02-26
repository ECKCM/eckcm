"use client";

import { useMemo } from "react";
import DOMPurify from "dompurify";

interface SanitizedHtmlProps {
  html: string;
  className?: string;
}

export function SanitizedHtml({ html, className }: SanitizedHtmlProps) {
  const clean = useMemo(() => DOMPurify.sanitize(html), [html]);

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
