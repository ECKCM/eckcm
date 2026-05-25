/**
 * Server-side HTML sanitization for outbound email bodies.
 *
 * Why DOMPurify and not a regex/escapeHtml? Admins compose the announcement
 * body via a WYSIWYG editor that emits real HTML (tags + attributes), so we
 * need to *keep* safe markup while stripping anything that could fire JS,
 * load tracking pixels we didn't intend, or break the rendered email.
 *
 * Uses isomorphic-dompurify so the same call works in the Node runtime that
 * Next.js route handlers run on.
 */
import DOMPurify from "isomorphic-dompurify";
import { convert as htmlToText } from "html-to-text";

const ALLOWED_TAGS = [
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
];

const ALLOWED_ATTR = [
  "href",
  "src",
  "alt",
  "title",
  "target",
  "rel",
  "style",
  "width",
  "height",
  "align",
  "valign",
  "colspan",
  "rowspan",
  "cellpadding",
  "cellspacing",
  "border",
];

export function sanitizeEmailHtml(rawHtml: string): string {
  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|#|\/|[\w-]+:)/i,
    // Force external links to open in a new tab and never leak referrer.
    ADD_ATTR: ["target"],
  });
}

/**
 * Generate the plain-text alternative body for the email.
 * Including a `text` part alongside `html` materially improves
 * inbox placement (Gmail / Outlook score multipart messages higher).
 */
export function htmlToPlainText(html: string): string {
  return htmlToText(html, {
    wordwrap: 78,
    selectors: [
      { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
      { selector: "img", format: "skip" },
    ],
  }).trim();
}
