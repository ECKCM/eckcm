/**
 * Server-side HTML sanitization for outbound email bodies.
 *
 * Why sanitize-html and not a regex/escapeHtml? Admins compose the announcement
 * body via a WYSIWYG editor that emits real HTML (tags + attributes), so we
 * need to *keep* safe markup while stripping anything that could fire JS,
 * load tracking pixels we didn't intend, or break the rendered email.
 *
 * Uses sanitize-html (htmlparser2-based) rather than DOMPurify/jsdom: jsdom 29
 * pulls in the ESM-only @exodus/bytes, which crashes under require() in the
 * bundled serverless runtime (ERR_REQUIRE_ESM). sanitize-html is pure JS with
 * no jsdom dependency, so it runs cleanly in Next.js route handlers.
 */
import sanitizeHtml from "sanitize-html";
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
  return sanitizeHtml(rawHtml, {
    allowedTags: ALLOWED_TAGS,
    // DOMPurify's ALLOWED_ATTR is a flat list applied to every tag, so mirror
    // that by allowing the same attribute set on all tags ("*").
    allowedAttributes: { "*": ALLOWED_ATTR },
    // Match DOMPurify's ALLOWED_URI_REGEXP (https/mailto/tel/#/relative). Schemes
    // not listed here are dropped; relative + anchor URLs are allowed below.
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: {},
    allowProtocolRelative: true,
    // Keep inline styles (the WYSIWYG editor emits them); sanitize-html still
    // strips javascript:/expression() style values by default.
    allowedStyles: {},
    transformTags: {
      // Force external links to open in a new tab and never leak referrer —
      // the equivalent of DOMPurify ADD_ATTR:["target"] plus our rel hardening.
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
    },
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
