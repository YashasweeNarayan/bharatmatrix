import { NextRequest, NextResponse } from "next/server";
import {
  ForbiddenError,
  UnauthorizedError,
  requireAdmin,
  type AuthUser,
} from "@/lib/auth";
import { sql } from "@/lib/db";
import { sameOrigin } from "@/lib/security";

/**
 * One call at the top of every admin route:
 *   const g = await adminOrResponse(req); if ("response" in g) return g.response;
 * Enforces: signed in, admin-flagged session, still on ADMIN_EMAILS, and
 * (for anything but GET) a same-origin request.
 */
export async function adminOrResponse(
  req: NextRequest,
): Promise<{ admin: AuthUser } | { response: NextResponse }> {
  if (req.method !== "GET" && !sameOrigin(req)) {
    return {
      response: NextResponse.json({ error: "Bad request." }, { status: 403 }),
    };
  }
  try {
    return { admin: await requireAdmin(req) };
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return {
        response: NextResponse.json({ error: "Not signed in." }, { status: 401 }),
      };
    }
    if (e instanceof ForbiddenError) {
      return {
        response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
      };
    }
    throw e;
  }
}

export async function audit(
  admin: AuthUser,
  action: string,
  target?: string,
): Promise<void> {
  try {
    await sql`
      insert into admin_audit (admin_id, admin_email, action, target)
      values (${admin.id}, ${admin.email}, ${action}, ${target ?? null})
    `;
  } catch {
    // Never let audit logging break the request it describes.
  }
}
