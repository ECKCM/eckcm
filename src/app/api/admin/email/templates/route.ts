import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeEmailHtml } from "@/lib/email/sanitize";
import { logger } from "@/lib/logger";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(200),
  body_html: z.string().trim().min(1).max(50000),
  department_ids: z.array(z.string().uuid()).max(50).default([]),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("eckcm_email_templates")
    .select("id, name, subject, body_html, department_ids, created_by, updated_by, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    logger.error("[admin/email/templates] List failed", { error: error.message });
    return NextResponse.json({ error: "Failed to load templates" }, { status: 500 });
  }

  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { name, subject, body_html, department_ids } = parsed.data;
  const cleanHtml = await sanitizeEmailHtml(body_html);
  if (!cleanHtml.trim()) {
    return NextResponse.json(
      { error: "Body is empty after sanitization" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("eckcm_email_templates")
    .insert({
      name,
      subject,
      body_html: cleanHtml,
      department_ids,
      created_by: auth.user.id,
      updated_by: auth.user.id,
    })
    .select("id, name, subject, body_html, department_ids, created_by, updated_by, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A template with that name already exists" },
        { status: 409 }
      );
    }
    logger.error("[admin/email/templates] Create failed", { error: error.message });
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }

  return NextResponse.json({ template: data }, { status: 201 });
}
