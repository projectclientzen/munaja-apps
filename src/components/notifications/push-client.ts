import type { PushRepository } from "@/data";
import { pushState, type PushEnv, type PushState } from "./push-support";

/** What this browser remembers about its own subscription, per signed-in user. The server never sends the endpoint back. */
export interface StoredSubscription {
  id: string;
}

export interface BrowserSubscriptionLike {
  toJSON(): { endpoint?: string; keys?: Record<string, string> };
  unsubscribe(): Promise<boolean>;
}

export interface RegistrationLike {
  pushManager: {
    getSubscription(): Promise<BrowserSubscriptionLike | null>;
    subscribe(opts: { userVisibleOnly: boolean; applicationServerKey: BufferSource }): Promise<BrowserSubscriptionLike>;
  };
}

export interface PushClientDeps {
  /** Mock mode simulates the subscription: the permission prompt is real, nothing reaches a push service. */
  mode: "mock" | "live";
  /** Only the live layer has it. */
  push?: Pick<PushRepository, "getPublicKey" | "addSubscription" | "removeSubscription">;
  permission(): NotificationPermission | null;
  requestPermission(): Promise<NotificationPermission>;
  /** The active service worker registration, or null when none is ready (dev builds, first visit). */
  registration(): Promise<RegistrationLike | null>;
  store: { read(): StoredSubscription | null; write(v: StoredSubscription): void; clear(): void };
}

export type EnableResult =
  | { kind: "active" }
  | { kind: "denied" }
  | { kind: "dismissed" }
  | { kind: "unavailable" }
  | { kind: "no_worker" };

/** Base64url (the VAPID public key format) to the bytes `pushManager.subscribe` wants. */
export function urlBase64ToBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const isCode = (e: unknown, code: string) => typeof e === "object" && e !== null && (e as { code?: unknown }).code === code;

/** Called only from a button tap: the permission prompt must follow a user gesture (and iOS requires it). */
export async function enableReminders(d: PushClientDeps): Promise<EnableResult> {
  let key: string | null = null;
  if (d.mode === "live") {
    if (!d.push) return { kind: "unavailable" };
    try {
      key = (await d.push.getPublicKey()).public_key;
    } catch (e) {
      if (isCode(e, "NOT_AVAILABLE")) return { kind: "unavailable" };
      throw e;
    }
  }

  const permission = d.permission() === "granted" ? "granted" : await d.requestPermission();
  if (permission === "denied") return { kind: "denied" };
  if (permission !== "granted") return { kind: "dismissed" };

  if (d.mode === "mock") {
    d.store.write({ id: "demo" });
    return { kind: "active" };
  }

  const reg = await d.registration();
  if (!reg) return { kind: "no_worker" };
  // Always start from a fresh subscription: one made with an older VAPID key would be rejected by the push service.
  const old = await reg.pushManager.getSubscription();
  if (old) await old.unsubscribe().catch(() => false);
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(key!) });
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    await sub.unsubscribe().catch(() => false);
    throw new Error("incomplete push subscription");
  }
  const saved = await d.push!.addSubscription({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
  d.store.write({ id: saved.id });
  return { kind: "active" };
}

/** Browser first, then the server row. A server row that is already gone counts as done. */
export async function disableReminders(d: PushClientDeps): Promise<void> {
  const stored = d.store.read();
  if (d.mode === "live") {
    const reg = await d.registration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) await sub.unsubscribe().catch(() => false);
    if (stored && d.push) {
      try {
        await d.push.removeSubscription(stored.id);
      } catch (e) {
        if (!isCode(e, "NOT_FOUND")) throw e;
      }
    }
  }
  d.store.clear();
}

export type ReminderView = PushState | "active";

/** Active needs permission AND a subscription this browser made for this user. Otherwise the button stays. */
export function reminderView(env: PushEnv, stored: StoredSubscription | null): ReminderView {
  const base = pushState(env);
  return base === "granted" && stored ? "active" : base === "granted" ? "can_ask" : base;
}
