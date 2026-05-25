"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect } from "react";
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Unlink,
  Undo2,
  Redo2,
  Code,
  Eraser,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: number;
}

/**
 * WYSIWYG HTML editor for email composition.
 * Output is sanitized server-side before being sent to recipients.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  className,
  minHeight = 220,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // We render headings via the toolbar; keep H1-H3 useful for emails.
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
      Placeholder.configure({
        placeholder:
          placeholder ?? "Write your announcement…",
        emptyEditorClass:
          "before:content-[attr(data-placeholder)] before:text-muted-foreground before:float-left before:h-0 before:pointer-events-none",
      }),
    ],
    content: value || "",
    // The editor mounts client-side only. Avoid the SSR hydration warning.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm max-w-none focus:outline-none px-3 py-2 cursor-text",
          "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a]:cursor-pointer",
          "[&_h1]:text-xl [&_h1]:font-semibold [&_h1]:my-2",
          "[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:my-2",
          "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:my-1.5",
          "[&_p]:my-1.5 [&_ul]:my-2 [&_ol]:my-2 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5",
          "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
          "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs"
        ),
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      // TipTap returns "<p></p>" for an empty doc — normalize to "" so
      // required-field checks behave intuitively.
      onChange(editor.isEmpty ? "" : html);
    },
  });

  // Keep external value in sync (e.g., when a saved template is loaded).
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current && !(editor.isEmpty && value === "")) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) {
    return (
      <div
        className={cn(
          "rounded-md border border-input bg-background",
          className
        )}
        style={{ minHeight }}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ring-offset-background overflow-hidden",
        className
      )}
    >
      <Toolbar editor={editor} />
      {/* Clicking the padding around the contenteditable should focus and
          show a text caret, not a button pointer. */}
      <div
        style={{ minHeight }}
        className="overflow-y-auto cursor-text"
        onMouseDown={(e) => {
          // If the user clicks in the empty space below the text, focus the
          // editor at the end so the caret lands where they expect.
          if (e.target === e.currentTarget) {
            e.preventDefault();
            editor.chain().focus("end").run();
          }
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

interface ToolbarProps {
  editor: Editor;
}

function Toolbar({ editor }: ToolbarProps) {
  const groups = [
    [
      {
        icon: Bold,
        label: "Bold",
        onClick: () => editor.chain().focus().toggleBold().run(),
        active: editor.isActive("bold"),
        disabled: !editor.can().chain().focus().toggleBold().run(),
      },
      {
        icon: Italic,
        label: "Italic",
        onClick: () => editor.chain().focus().toggleItalic().run(),
        active: editor.isActive("italic"),
        disabled: !editor.can().chain().focus().toggleItalic().run(),
      },
      {
        icon: Strikethrough,
        label: "Strikethrough",
        onClick: () => editor.chain().focus().toggleStrike().run(),
        active: editor.isActive("strike"),
        disabled: !editor.can().chain().focus().toggleStrike().run(),
      },
      {
        icon: Code,
        label: "Inline code",
        onClick: () => editor.chain().focus().toggleCode().run(),
        active: editor.isActive("code"),
        disabled: !editor.can().chain().focus().toggleCode().run(),
      },
    ],
    [
      {
        icon: Heading1,
        label: "Heading 1",
        onClick: () =>
          editor.chain().focus().toggleHeading({ level: 1 }).run(),
        active: editor.isActive("heading", { level: 1 }),
      },
      {
        icon: Heading2,
        label: "Heading 2",
        onClick: () =>
          editor.chain().focus().toggleHeading({ level: 2 }).run(),
        active: editor.isActive("heading", { level: 2 }),
      },
      {
        icon: Heading3,
        label: "Heading 3",
        onClick: () =>
          editor.chain().focus().toggleHeading({ level: 3 }).run(),
        active: editor.isActive("heading", { level: 3 }),
      },
    ],
    [
      {
        icon: List,
        label: "Bulleted list",
        onClick: () => editor.chain().focus().toggleBulletList().run(),
        active: editor.isActive("bulletList"),
      },
      {
        icon: ListOrdered,
        label: "Numbered list",
        onClick: () => editor.chain().focus().toggleOrderedList().run(),
        active: editor.isActive("orderedList"),
      },
      {
        icon: Quote,
        label: "Quote",
        onClick: () => editor.chain().focus().toggleBlockquote().run(),
        active: editor.isActive("blockquote"),
      },
    ],
    [
      {
        icon: LinkIcon,
        label: "Link",
        onClick: () => {
          const prev = editor.getAttributes("link").href as string | undefined;
          const url = window.prompt("URL", prev ?? "https://");
          if (url === null) return;
          if (url === "") {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            return;
          }
          // Basic sanity: require an http(s) or mailto scheme.
          const ok = /^(https?:\/\/|mailto:)/i.test(url);
          if (!ok) {
            window.alert("Link must start with http://, https:// or mailto:");
            return;
          }
          editor
            .chain()
            .focus()
            .extendMarkRange("link")
            .setLink({ href: url })
            .run();
        },
        active: editor.isActive("link"),
      },
      {
        icon: Unlink,
        label: "Remove link",
        onClick: () =>
          editor.chain().focus().extendMarkRange("link").unsetLink().run(),
        disabled: !editor.isActive("link"),
      },
    ],
    [
      {
        icon: Undo2,
        label: "Undo",
        onClick: () => editor.chain().focus().undo().run(),
        disabled: !editor.can().chain().focus().undo().run(),
      },
      {
        icon: Redo2,
        label: "Redo",
        onClick: () => editor.chain().focus().redo().run(),
        disabled: !editor.can().chain().focus().redo().run(),
      },
      {
        icon: Eraser,
        label: "Clear formatting",
        onClick: () =>
          editor.chain().focus().unsetAllMarks().clearNodes().run(),
      },
    ],
  ];

  return (
    <div
      role="toolbar"
      aria-label="Email body formatting"
      className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-1.5 py-1.5"
    >
      {groups.map((group, gi) => (
        <div key={gi} className="flex items-center gap-0.5">
          {gi > 0 && (
            <span
              aria-hidden
              className="mx-1 h-5 w-px bg-border"
            />
          )}
          {group.map((btn) => {
            const Icon = btn.icon;
            return (
              <button
                key={btn.label}
                type="button"
                title={btn.label}
                aria-label={btn.label}
                aria-pressed={"active" in btn ? !!btn.active : undefined}
                onClick={btn.onClick}
                disabled={"disabled" in btn ? !!btn.disabled : false}
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded text-muted-foreground transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  "disabled:pointer-events-none disabled:opacity-40",
                  "active" in btn && btn.active
                    ? "bg-accent text-accent-foreground"
                    : ""
                )}
              >
                <Icon className="size-3.5" />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
