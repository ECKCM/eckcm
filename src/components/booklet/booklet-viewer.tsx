"use client";

import Link from "next/link";
import { ArrowLeft, Download, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";

type BookletPageItem = { src: string; w: number; h: number };
type BookletManifest = {
  version: number;
  pageCount: number;
  pdf: string;
  pages: BookletPageItem[];
};

interface BookletViewerProps {
  base: string;
  manifest: BookletManifest | null;
}

export function BookletViewer({ base, manifest }: BookletViewerProps) {
  const { t } = useI18n();

  if (!manifest || manifest.pages.length === 0) {
    return (
      <div className="home-gradient flex min-h-screen flex-col items-center justify-center gap-6 p-4 text-center">
        <BookOpen className="size-10 text-muted-foreground" />
        <p className="max-w-sm text-muted-foreground">{t("booklet.notReady")}</p>
        <Button asChild variant="outline">
          <Link href="/">
            <ArrowLeft className="mr-2 size-4" />
            {t("booklet.backToHome")}
          </Link>
        </Button>
      </div>
    );
  }

  const pdfUrl = base + manifest.pdf;

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Sticky bar: back · title · download */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">{t("booklet.backToHome")}</span>
        </Link>
        <h1 className="truncate text-sm font-semibold">{t("booklet.title")}</h1>
        <Button asChild size="sm" variant="outline" className="gap-2">
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer" download>
            <Download className="size-4" />
            <span className="hidden sm:inline">{t("booklet.downloadPdf")}</span>
          </a>
        </Button>
      </header>

      {/* Pages: vertical scroll. Only the first couple load eagerly; the rest
          lazy-load as the reader scrolls, keeping initial transfer tiny. */}
      <main className="mx-auto flex max-w-3xl flex-col gap-3 p-3 sm:gap-4 sm:p-4">
        {manifest.pages.map((p, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- pre-optimized WebP on the storage CDN; next/image would add needless optimization cost
          <img
            key={p.src}
            src={base + p.src}
            width={p.w}
            height={p.h}
            loading={i < 2 ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={i === 0 ? "high" : "auto"}
            alt={`${t("booklet.title")} — ${i + 1} / ${manifest.pageCount}`}
            className="h-auto w-full rounded-md bg-white shadow-sm"
          />
        ))}
      </main>

      {/* Bottom download — large mobile tap target */}
      <div className="mx-auto max-w-3xl p-4">
        <Button asChild size="lg" className="w-full gap-2">
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer" download>
            <Download className="size-5" />
            {t("booklet.downloadPdf")}
          </a>
        </Button>
      </div>
    </div>
  );
}
