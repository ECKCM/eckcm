import type { Metadata } from "next";
import { BookletViewer } from "@/components/booklet/booklet-viewer";

export const metadata: Metadata = {
  title: "Event Booklet",
};

// The page (and the small manifest fetch) revalidate periodically. The page
// images themselves are immutable on the storage CDN, so this never touches
// the database — only a tiny JSON read from the public bucket.
export const revalidate = 600;

type BookletPageItem = { src: string; w: number; h: number };
type BookletManifest = {
  version: number;
  pageCount: number;
  pdf: string;
  pages: BookletPageItem[];
};

const BUCKET_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/booklet/`
  : "";

async function getManifest(): Promise<BookletManifest | null> {
  if (!BUCKET_BASE) return null;
  try {
    const res = await fetch(`${BUCKET_BASE}manifest.json`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as BookletManifest;
    if (!data?.pages?.length) return null;
    return data;
  } catch {
    return null;
  }
}

export default async function BookletPage() {
  const manifest = await getManifest();
  return <BookletViewer base={BUCKET_BASE} manifest={manifest} />;
}
