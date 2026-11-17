/**
 * Read-only check of the real Scalev API against what this app expects. Run ON THE SERVER, with the production env:
 *
 *   set -a; . /opt/munaja-app/.env; set +a
 *   pnpm exec tsx scripts/scalev-probe.ts <order-uuid>     # one paid order (data.id, UUIDv7)
 *   pnpm exec tsx scripts/scalev-probe.ts --list           # first page of paid orders
 *
 * It only sends GET requests. It never writes to Scalev or to the database. The output is safe to paste in a chat:
 * no API key, no headers, no names, emails or phone numbers. Strings are replaced by their shape (e.g. "628#########",
 * "<email>", "<text 12>"), except status-like fields and timestamps, which carry no personal data.
 */
import { createHash } from "node:crypto";
import { loadScalevConfig } from "@/server/scalev/config";
import { parseOrder, parseOrderPage } from "@/server/scalev/client";
import { evaluateOrder } from "@/server/scalev/verify";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Keys whose values are shown as they are: statuses, ids of products, money, and times. Nothing personal. */
const SHOW = /^(event|status|payment_status|payment_method|currency|variant|variant_sku|sku|product|quantity|is_probably_spam|net_revenue|gross_revenue|total|amount|has_next|page_size|id|order_id|store|store_id)$/i;
const TIME = /(time|_at|date)$/i;

function shapeOf(key: string, v: unknown, depth = 0): unknown {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.length === 0 ? [] : [shapeOf(key, v[0], depth + 1), `(${v.length} item)`];
  if (typeof v === "object") {
    if (depth > 4) return "<object>";
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, shapeOf(k, x, depth + 1)]));
  }
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return SHOW.test(key) || TIME.test(key) ? v : "<number>";
  const s = String(v);
  if (SHOW.test(key) || TIME.test(key)) return s;
  if (/@/.test(s)) return "<email>";
  if (/^\+?\d[\d\s-]{6,}$/.test(s)) return s.replace(/\d/g, (d, i: number) => (i < 3 ? d : "#"));
  return `<text ${s.length}>`;
}

async function get(base: string, key: string, path: string): Promise<{ status: number; body: unknown }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10_000);
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: ctl.signal,
      redirect: "error",
    });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = `<non-JSON, ${text.length} bytes>`;
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(t);
  }
}

async function main(): Promise<void> {
  const arg = process.argv[2] ?? "";
  const cfg = loadScalevConfig();
  if (!cfg.apiKey) throw new Error("SCALEV_API_KEY is empty. Load the server env first.");
  if (!cfg.storeId) console.log("! SCALEV_STORE_ID is empty");
  console.log(`API base: ${cfg.apiBase}`);
  console.log(
    `Allowed variants: ${JSON.stringify(cfg.allowedVariants, (_k, v: unknown) => (v instanceof Set ? [...(v as Set<unknown>)] : v))}`,
  );

  if (arg === "--list") {
    const q = new URLSearchParams({ store_id: cfg.storeId ?? "", payment_status: "paid", page_size: "3" });
    const r = await get(cfg.apiBase, cfg.apiKey, `/v3/orders?${q.toString()}`);
    console.log(`\nGET /v3/orders?payment_status=paid -> HTTP ${r.status}`);
    console.log("Response shape:", JSON.stringify(shapeOf("", r.body), null, 2));
    const page = parseOrderPage(r.body);
    console.log(
      page
        ? `App parser: OK, ${page.orders.length} order(s) read, next cursor ${page.nextCursor ? "present" : "none"}`
        : "App parser: CANNOT READ this list (sweeper polling would stop with NEEDS_VERIFICATION)",
    );
    return;
  }

  if (!UUID.test(arg)) throw new Error("Usage: scalev-probe.ts <order-uuid> | --list");
  const r = await get(cfg.apiBase, cfg.apiKey, `/v3/orders/${arg.toLowerCase()}`);
  console.log(`\nGET /v3/orders/{id} -> HTTP ${r.status}`);
  console.log("Response shape:", JSON.stringify(shapeOf("", r.body), null, 2));
  const order = parseOrder(r.body);
  if (!order) {
    console.log("\nApp parser: CANNOT READ this order. The worker would retry and then mark it for admin.");
    return;
  }
  // A throwaway pepper: only "is there a usable phone" matters here, not the real hash.
  const pepper = createHash("sha256").update(`probe-${Date.now()}`).digest("hex");
  const v = evaluateOrder(order, cfg, pepper);
  console.log("\nApp parser: OK");
  console.log(`  payment_status=${order.paymentStatus} status=${order.status} spam=${order.isSpam}`);
  console.log(`  orderlines: ${JSON.stringify(order.orderlines)}`);
  console.log(`  email found: ${v.email ? "yes" : "NO"}  phone usable: ${v.phoneHash ? "yes" : "NO"}`);
  console.log(`  createdAt: ${order.createdAt ?? "NOT FOUND"}  paidAt: ${order.paidAt ?? "NOT FOUND (field name to confirm)"}`);
  console.log(
    `\nVerdict: ${!v.paid ? "NOT PAID (worker waits and retries)" : v.quarantine ? `QUARANTINE: ${v.quarantine}` : "WOULD GRANT ACCESS (buyer can activate with email + phone)"}`,
  );
}

main().catch((e: unknown) => {
  // Never print the error object: a fetch error can carry the request.
  console.error(`Probe failed: ${e instanceof Error ? e.message : "unknown error"}`);
  process.exit(1);
});
