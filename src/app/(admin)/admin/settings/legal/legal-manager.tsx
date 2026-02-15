"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import Link from "next/link";

interface LegalPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  updated_at: string;
}

export function LegalManager({ initialPages }: { initialPages: LegalPage[] }) {
  const router = useRouter();
  const [pages, setPages] = useState(initialPages);
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
    setSaving(null);
    router.refresh();

    const { data } = await supabase
      .from("eckcm_legal_content")
      .select("*")
      .order("slug");
    if (data) setPages(data);
  };

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        Edit the Terms of Service and Privacy Policy content displayed on public pages. Content supports HTML.
      </p>

      {pages.map((page) => (
        <div key={page.id} className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base font-semibold">{page.title}</Label>
              <p className="text-xs text-muted-foreground">
                Last updated: {page.updated_at ? new Date(page.updated_at).toISOString().slice(0, 10) : "Never"}
              </p>
            </div>
            <Link
              href={`/${page.slug}`}
              target="_blank"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              Preview <ExternalLink className="size-3" />
            </Link>
          </div>
          <Textarea
            value={contents[page.slug] ?? ""}
            onChange={(e) =>
              setContents((prev) => ({ ...prev, [page.slug]: e.target.value }))
            }
            rows={16}
            className="font-mono text-sm"
            placeholder={`Enter ${page.title} content (HTML supported)...`}
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
    </div>
  );
}
