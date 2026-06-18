import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeEmailHtml } from "@/lib/email/sanitize";
import { logger } from "@/lib/logger";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  subject: z.string().trim().min(1).max(200).optional(),
  body_html: z.string().trim().min(1).max(50000).optional(),
  department_ids: z.array(z.string().uuid()).max(50).optional(),
});

const paramsSchema = z.object({ id: z.string().uuid() });

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = await ctx.params;
  const paramsParsed = paramsSchema.safeParse(params);
  if (!paramsParsed.success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const patch: Record<string, unknown> = { updated_by: auth.user.id };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.subject !== undefined) patch.subject = parsed.data.subject;
  if (parsed.data.body_html !== undefined) {
    const cleanHtml = await sanitizeEmailHtml(parsed.data.body_html);
    if (!cleanHtml.trim()) {
      return NextResponse.json(
        { error: "Body is empty after sanitization" },
        { status: 400 }
      );
    }
    patch.body_html = cleanHtml;
  }
  if (parsed.data.department_ids !== undefined) {
    patch.department_ids = parsed.data.department_ids;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("eckcm_email_templates")
    .update(patch)
    .eq("id", paramsParsed.data.id)
    .select("id, name, subject, body_html, department_ids, created_by, updated_by, created_at, updated_at")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A template with that name already exists" },
        { status: 409 }
      );
    }
    logger.error("[admin/email/templates] Update failed", { error: error.message });
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  return NextResponse.json({ template: data });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = await ctx.params;
  const paramsParsed = paramsSchema.safeParse(params);
  if (!paramsParsed.success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("eckcm_email_templates")
    .delete()
    .eq("id", paramsParsed.data.id);

  if (error) {
    logger.error("[admin/email/templates] Delete failed", { error: error.message });
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
