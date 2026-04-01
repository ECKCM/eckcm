"use client";

import { useEffect, useState } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { BookOpen, ExternalLink } from "lucide-react";

export default function BookletSettingsPage() {
  const [bookletUrl, setBookletUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/app-config");
        if (res.ok) {
          const data = await res.json();
          setBookletUrl(data.booklet_url ?? "");
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/app-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booklet_url: bookletUrl }),
      });
      if (res.ok) {
        toast.success("Booklet URL saved");
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to save");
      }
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col">
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-6" />
          <h1 className="text-lg font-semibold">Booklet</h1>
        </header>
        <div className="flex items-center justify-center p-12">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Booklet</h1>
      </header>
      <div className="mx-auto w-full max-w-2xl p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="size-5" />
              Booklet Settings
            </CardTitle>
            <CardDescription>
              Set a URL for the event booklet. This can be a link to a PDF file, Google Drive document, or any web page.
              The booklet button will appear on the dashboard and public E-Pass pages.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="booklet-url">Booklet URL</Label>
              <Input
                id="booklet-url"
                value={bookletUrl}
                onChange={(e) => setBookletUrl(e.target.value)}
                placeholder="https://drive.google.com/file/d/... or https://example.com/booklet.pdf"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to hide the booklet button from all pages.
              </p>
            </div>

            {bookletUrl && (
              <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
                <a
                  href={bookletUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline truncate"
                >
                  {bookletUrl}
                </a>
              </div>
            )}

            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
