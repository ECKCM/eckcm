"use client";

import { useEffect, useRef, useState } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { BookOpen, ExternalLink, Upload, FileText, X, Loader2 } from "lucide-react";

export default function BookletSettingsPage() {
  const [bookletUrl, setBookletUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are allowed");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File must be under 20MB");
      return;
    }
    setSelectedFile(file);
  }

  async function handleUpload() {
    if (!selectedFile) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch("/api/admin/booklet-upload", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setBookletUrl(data.url);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        toast.success("PDF uploaded and booklet URL updated");
      } else {
        const err = await res.json();
        toast.error(err.error || "Upload failed");
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
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
      <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
        {/* PDF Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="size-5" />
              Upload PDF
            </CardTitle>
            <CardDescription>
              Upload a PDF file directly. This will replace any existing booklet file and update the URL automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="booklet-file">PDF File (max 20MB)</Label>
              <Input
                id="booklet-file"
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={handleFileSelect}
                className="cursor-pointer"
              />
            </div>

            {selectedFile && (
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{selectedFile.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    ({(selectedFile.size / 1024 / 1024).toFixed(1)} MB)
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0"
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                >
                  <X className="size-3" />
                </Button>
              </div>
            )}

            <Button onClick={handleUpload} disabled={!selectedFile || uploading}>
              {uploading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 size-4" />
                  Upload PDF
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* URL Setting */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="size-5" />
              Booklet URL
            </CardTitle>
            <CardDescription>
              Or set a URL manually. This can be a link to a Google Drive document, external PDF, or any web page.
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
