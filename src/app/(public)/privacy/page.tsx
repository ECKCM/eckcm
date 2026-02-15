import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function PrivacyPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("eckcm_legal_content")
    .select("title, content, updated_at")
    .eq("slug", "privacy")
    .single();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to Home
      </Link>

      <h1 className="mb-2 text-3xl font-bold">{data?.title ?? "Privacy Policy"}</h1>
      {data?.updated_at && (
        <p className="mb-6 text-sm text-muted-foreground">
          Last updated: {new Date(data.updated_at).toLocaleDateString()}
        </p>
      )}

      {data?.content ? (
        <div
          className="prose prose-sm max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: data.content }}
        />
      ) : (
        <p className="text-muted-foreground">Coming soon.</p>
      )}
    </div>
  );
}
