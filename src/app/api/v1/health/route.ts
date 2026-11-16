import { getDb } from "@/server/db";

// Never cached. Answers only ok or not: no version, no error text, no config detail.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" } as const;

export async function GET(): Promise<Response> {
  try {
    const db = await getDb();
    await db.asService((q) => q.query("select 1"));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch {
    return new Response(JSON.stringify({ ok: false }), { status: 503, headers });
  }
}
