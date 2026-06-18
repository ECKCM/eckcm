import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveParticipantEmails } from "@/lib/email/recipients";
import { logger } from "@/lib/logger";

const querySchema = z.object({
  eventId: z.string().uuid(),
  departmentIds: z.array(z.string().uuid()).default([]),
  registrationGroupIds: z.array(z.string().uuid()).default([]),
});

/**
 * Preview the recipient set for an announcement without sending.
 * Returns the unique participant-email count plus a small sample
 * (first 5, partially obfuscated) so the admin can sanity-check the filter.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const eventId = url.searchParams.get("eventId") ?? "";
  const deptParam = url.searchParams.getAll("departmentIds");
  // Support both repeated ?departmentIds=...&departmentIds=... and a single
  // comma-joined value so the client can use whichever is convenient.
  const departmentIds = deptParam
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
  const registrationGroupIds = url.searchParams
    .getAll("registrationGroupIds")
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);

  const parsed = querySchema.safeParse({ eventId, departmentIds, registrationGroupIds });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const admin = createAdminClient();
    const emails = await resolveParticipantEmails({
      admin,
      eventId: parsed.data.eventId,
      departmentIds: parsed.data.departmentIds,
      registrationGroupIds: parsed.data.registrationGroupIds,
    });

    const sample = emails.slice(0, 5).map(obfuscateEmail);
    return NextResponse.json({ count: emails.length, sample });
  } catch (error) {
    logger.error("[admin/email/recipients] Failed", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to resolve recipients" },
      { status: 500 }
    );
  }
}

function obfuscateEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 1) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${"*".repeat(Math.max(local.length - 2, 1))}${domain}`;
}
