import { h } from "@/server/api/routes";

// Read from the environment on every request, so rotating the VAPID key needs no rebuild.
export const dynamic = "force-dynamic";

export const GET = h.pushPublicKey;
