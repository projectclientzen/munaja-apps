import { POST as v1Post } from "@/app/api/v1/webhooks/scalev/route";

// Alias of /api/v1/webhooks/scalev. The Scalev dashboard was saved with this path (owner, 16 Nov 2026).
// Same handler, same HMAC check, same limits: nothing here may diverge from the v1 route.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(req: Request): Promise<Response> {
  return v1Post(req);
}
