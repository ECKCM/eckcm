"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRealtime, useChangeDetector } from "@/lib/hooks/use-realtime";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { toast } from "sonner";
import { logActivity } from "@/lib/audit-client";
import { ExternalLink } from "lucide-react";
import Link from "next/link";

interface LegalPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  updated_at: string;
}

const INSTRUCTION_SLUGS = ["registration-instructions-en", "registration-instructions-ko"];

function isInstructionSlug(slug: string) {
  return INSTRUCTION_SLUGS.includes(slug);
}

export function LegalManager({ initialPages }: { initialPages: LegalPage[] }) {
  const router = useRouter();
  const [pages, setPages] = useState(initialPages);

  // Live updates
  const _reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRealtime({ table: "eckcm_legal_content", event: "*" }, () => {
    if (_reloadTimer.current) clearTimeout(_reloadTimer.current);
    _reloadTimer.current = setTimeout(() => router.refresh(), 500);
  });
  useChangeDetector("eckcm_legal_content", () => router.refresh(), 5000);

  const [saving, setSaving] = useState<string | null>(null);
  const [contents, setContents] = useState<Record<string, string>>(
    Object.fromEntries(initialPages.map((p) => [p.slug, p.content]))
  );

  const handleSave = async (page: LegalPage) => {
    setSaving(page.slug);
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("eckcm_legal_content")
      .update({
        content: contents[page.slug],
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      })
      .eq("id", page.id);

    if (error) {
      toast.error(error.message);
      setSaving(null);
      return;
    }

    toast.success(`${page.title} saved`);
    logActivity({ action: "UPDATE", entity_type: "legal_content", entity_id: page.id, new_data: { slug: page.slug, title: page.title } });
    setSaving(null);
    router.refresh();

    const { data } = await supabase
      .from("eckcm_legal_content")
      .select("*")
      .order("slug");
    if (data) setPages(data);
  };

  // Split pages into regular legal pages and instruction pages
  const regularPages = pages.filter((p) => !isInstructionSlug(p.slug));
  const instructionPages = pages.filter((p) => isInstructionSlug(p.slug));
  const instructionEn = instructionPages.find((p) => p.slug === "registration-instructions-en");
  const instructionKo = instructionPages.find((p) => p.slug === "registration-instructions-ko");

  const previewHref = (slug: string) => {
    if (slug === "terms") return "/terms";
    if (slug === "privacy") return "/privacy";
    return null;
  };

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        Edit legal content displayed on public pages. Content supports Markdown formatting.
      </p>

      {/* Regular legal pages (Terms, Privacy) */}
      {regularPages.map((page) => (
        <div key={page.id} className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base font-semibold">{page.title}</Label>
              <p className="text-xs text-muted-foreground">
                Last updated: {page.updated_at ? new Date(page.updated_at).toISOString().slice(0, 10) : "Never"}
              </p>
            </div>
            {previewHref(page.slug) && (
              <Link
                href={previewHref(page.slug)!}
                target="_blank"
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground active:opacity-70 transition-all"
              >
                Preview <ExternalLink className="size-3" />
              </Link>
            )}
          </div>
          <MarkdownEditor
            value={contents[page.slug] ?? ""}
            onChange={(val) =>
              setContents((prev) => ({ ...prev, [page.slug]: val }))
            }
            height={400}
            placeholder={`Enter ${page.title} content (Markdown supported)...`}
          />
          <div className="flex justify-end">
            <Button
              onClick={() => handleSave(page)}
              disabled={saving === page.slug}
            >
              {saving === page.slug ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      ))}

      {/* Registration Instructions (EN / KO) */}
      {(instructionEn || instructionKo) && (
        <div className="space-y-3 rounded-lg border p-4">
          <div>
            <Label className="text-base font-semibold">Registration Instructions</Label>
            <p className="text-xs text-muted-foreground">
              Displayed on Step 2 of the registration flow. Manage separate templates for English and Korean.
            </p>
          </div>

          <Tabs defaultValue="en" className="w-full">
            <TabsList>
              <TabsTrigger value="en">English</TabsTrigger>
              <TabsTrigger value="ko">Korean</TabsTrigger>
            </TabsList>

            {instructionEn && (
              <TabsContent value="en" className="space-y-3 mt-3">
                <p className="text-xs text-muted-foreground">
                  Last updated: {instructionEn.updated_at ? new Date(instructionEn.updated_at).toISOString().slice(0, 10) : "Never"}
                </p>
                <MarkdownEditor
                  value={contents[instructionEn.slug] ?? ""}
                  onChange={(val) =>
                    setContents((prev) => ({ ...prev, [instructionEn.slug]: val }))
                  }
                  height={400}
                  placeholder="Enter English registration instructions (Markdown supported)..."
                />
                <div className="flex justify-end">
                  <Button
                    onClick={() => handleSave(instructionEn)}
                    disabled={saving === instructionEn.slug}
                  >
                    {saving === instructionEn.slug ? "Saving..." : "Save English"}
                  </Button>
                </div>
              </TabsContent>
            )}

            {instructionKo && (
              <TabsContent value="ko" className="space-y-3 mt-3">
                <p className="text-xs text-muted-foreground">
                  Last updated: {instructionKo.updated_at ? new Date(instructionKo.updated_at).toISOString().slice(0, 10) : "Never"}
                </p>
                <MarkdownEditor
                  value={contents[instructionKo.slug] ?? ""}
                  onChange={(val) =>
                    setContents((prev) => ({ ...prev, [instructionKo.slug]: val }))
                  }
                  height={400}
                  placeholder="Enter Korean registration instructions (Markdown supported)..."
                />
                <div className="flex justify-end">
                  <Button
                    onClick={() => handleSave(instructionKo)}
                    disabled={saving === instructionKo.slug}
                  >
                    {saving === instructionKo.slug ? "Saving..." : "Save Korean"}
                  </Button>
                </div>
              </TabsContent>
            )}
          </Tabs>
        </div>
      )}
    </div>
  );
}
