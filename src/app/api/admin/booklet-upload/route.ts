import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/auth/admin";

const BUCKET = "booklet";
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

export async function POST(request: Request) {
  const auth = await requireSuperAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Only PDF files are allowed" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File must be under 20MB" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Ensure bucket exists (ignore error if already exists)
  await admin.storage.createBucket(BUCKET, { public: true });

  // Use a fixed filename so uploading a new file replaces the old one
  const fileName = `booklet.pdf`;

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(fileName, file, {
      upsert: true,
      contentType: "application/pdf",
    });

  if (uploadError) {
    return NextResponse.json(
      { error: "Upload failed: " + uploadError.message },
      { status: 500 }
    );
  }

  const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(fileName);
  const publicUrl = urlData.publicUrl;

  // Save URL to app config
  const { error: updateError } = await admin
    .from("eckcm_app_config")
    .update({ booklet_url: publicUrl })
    .eq("id", 1);

  if (updateError) {
    return NextResponse.json(
      { error: "File uploaded but failed to save URL" },
      { status: 500 }
    );
  }

  // Audit log
  await admin.from("eckcm_audit_logs").insert({
    user_id: auth.user.id,
    action: "UPLOAD_BOOKLET_PDF",
    entity_type: "app_config",
    entity_id: "1",
    new_data: { booklet_url: publicUrl },
  });

  return NextResponse.json({ success: true, url: publicUrl });
}
