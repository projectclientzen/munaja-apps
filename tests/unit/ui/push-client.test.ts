import { describe, expect, it } from "vitest";
import { ApiError } from "@/data/contracts";
import {
  disableReminders,
  enableReminders,
  reminderView,
  urlBase64ToBytes,
  type BrowserSubscriptionLike,
  type PushClientDeps,
  type StoredSubscription,
} from "@/components/notifications/push-client";

function fake(over: Partial<PushClientDeps> & { perm?: NotificationPermission; ask?: NotificationPermission } = {}) {
  const log: string[] = [];
  let stored: StoredSubscription | null = null;
  let current: BrowserSubscriptionLike | null = null;
  const mk = (n: string): BrowserSubscriptionLike => ({
    toJSON: () => ({ endpoint: `https://push.example.test/${n}`, keys: { p256dh: "P", auth: "A" } }),
    unsubscribe: async () => {
      log.push(`browser-unsub:${n}`);
      current = null;
      return true;
    },
  });
  let n = 0;
  const deps: PushClientDeps = {
    mode: "live",
    push: {
      getPublicKey: async () => ({ public_key: "BAQAB_w" }),
      addSubscription: async (r) => {
        log.push(`post:${r.endpoint}:${r.keys.p256dh}:${r.keys.auth}`);
        return { id: "sub-1", is_active: true, created_at: "2026-11-18T00:00:00.000Z" };
      },
      removeSubscription: async (id) => void log.push(`delete:${id}`),
    },
    permission: () => over.perm ?? "default",
    requestPermission: async () => {
      log.push("ask");
      return over.ask ?? "granted";
    },
    registration: async () => ({
      pushManager: {
        getSubscription: async () => current,
        subscribe: async (o) => {
          log.push(`subscribe:${o.userVisibleOnly}:${Array.from(new Uint8Array(o.applicationServerKey as ArrayBuffer)).join(",")}`);
          current = mk(String(++n));
          return current;
        },
      },
    }),
    store: { read: () => stored, write: (v) => void (stored = v), clear: () => void (stored = null) },
    ...over,
  };
  return { deps, log, stored: () => stored, setCurrent: (s: BrowserSubscriptionLike) => void (current = s), mk };
}

describe("urlBase64ToBytes", () => {
  it("decodes base64url with and without padding", () => {
    expect(Array.from(urlBase64ToBytes("BAQAB_w"))).toEqual([4, 4, 0, 7, 252]);
    expect(Array.from(urlBase64ToBytes("-_8"))).toEqual([251, 255]);
  });
});

describe("enableReminders (live)", () => {
  it("fetches the key, asks permission, subscribes and posts, in that order", async () => {
    const f = fake();
    expect(await enableReminders(f.deps)).toEqual({ kind: "active" });
    expect(f.log).toEqual(["ask", "subscribe:true:4,4,0,7,252", "post:https://push.example.test/1:P:A"]);
    expect(f.stored()).toEqual({ id: "sub-1" });
  });

  it("does not ask again when permission is already granted", async () => {
    const f = fake({ perm: "granted" });
    await enableReminders(f.deps);
    expect(f.log).not.toContain("ask");
  });

  it("replaces an old browser subscription instead of reusing it", async () => {
    const f = fake({ perm: "granted" });
    f.setCurrent(f.mk("old"));
    await enableReminders(f.deps);
    expect(f.log[0]).toBe("browser-unsub:old");
  });

  it("stops with 'unavailable' before any prompt when the server has no VAPID key", async () => {
    const f = fake();
    f.deps.push!.getPublicKey = async () => {
      throw new ApiError("NOT_AVAILABLE", "Pengingat belum tersedia.");
    };
    expect(await enableReminders(f.deps)).toEqual({ kind: "unavailable" });
    expect(f.log).toEqual([]);
  });

  it("passes other server errors up", async () => {
    const f = fake();
    f.deps.push!.getPublicKey = async () => {
      throw new ApiError("UNAUTHENTICATED", "Masuk lagi.");
    };
    await expect(enableReminders(f.deps)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("denied and dismissed prompts store nothing and post nothing", async () => {
    const d = fake({ ask: "denied" });
    expect(await enableReminders(d.deps)).toEqual({ kind: "denied" });
    const x = fake({ ask: "default" });
    expect(await enableReminders(x.deps)).toEqual({ kind: "dismissed" });
    for (const f of [d, x]) {
      expect(f.stored()).toBeNull();
      expect(f.log.some((l) => l.startsWith("post"))).toBe(false);
    }
  });

  it("reports a missing service worker without storing anything", async () => {
    const f = fake({ perm: "granted", registration: async () => null });
    expect(await enableReminders(f.deps)).toEqual({ kind: "no_worker" });
    expect(f.stored()).toBeNull();
  });

  it("drops a subscription that came back without keys", async () => {
    const f = fake({ perm: "granted" });
    const reg = await f.deps.registration();
    const bad: BrowserSubscriptionLike = { toJSON: () => ({ endpoint: "https://x.test/1" }), unsubscribe: async () => (f.log.push("dropped"), true) };
    reg!.pushManager.subscribe = async () => bad;
    f.deps.registration = async () => reg;
    await expect(enableReminders(f.deps)).rejects.toThrow("incomplete");
    expect(f.log).toContain("dropped");
    expect(f.stored()).toBeNull();
  });
});

describe("enableReminders (mock)", () => {
  it("simulates: real prompt, no key request, no subscribe, no POST", async () => {
    const f = fake({ mode: "mock", push: undefined });
    expect(await enableReminders(f.deps)).toEqual({ kind: "active" });
    expect(f.log).toEqual(["ask"]);
    expect(f.stored()).toEqual({ id: "demo" });
  });

  it("still honours a denied prompt", async () => {
    expect(await enableReminders(fake({ mode: "mock", push: undefined, ask: "denied" }).deps)).toEqual({ kind: "denied" });
  });
});

describe("disableReminders", () => {
  it("unsubscribes the browser, deletes the server row and forgets the id", async () => {
    const f = fake({ perm: "granted" });
    await enableReminders(f.deps);
    f.log.length = 0;
    await disableReminders(f.deps);
    expect(f.log).toEqual(["browser-unsub:1", "delete:sub-1"]);
    expect(f.stored()).toBeNull();
  });

  it("treats a server row that is already gone as done", async () => {
    const f = fake({ perm: "granted" });
    await enableReminders(f.deps);
    f.deps.push!.removeSubscription = async () => {
      throw new ApiError("NOT_FOUND", "Tidak ditemukan.");
    };
    await disableReminders(f.deps);
    expect(f.stored()).toBeNull();
  });

  it("keeps the id when the server call fails for another reason, so a retry can finish", async () => {
    const f = fake({ perm: "granted" });
    await enableReminders(f.deps);
    f.deps.push!.removeSubscription = async () => {
      throw new ApiError("NOT_AVAILABLE", "Gangguan.");
    };
    await expect(disableReminders(f.deps)).rejects.toMatchObject({ code: "NOT_AVAILABLE" });
    expect(f.stored()).toEqual({ id: "sub-1" });
  });

  it("mock mode only clears the local flag", async () => {
    const f = fake({ mode: "mock", push: undefined });
    await enableReminders(f.deps);
    f.log.length = 0;
    await disableReminders(f.deps);
    expect(f.log).toEqual([]);
    expect(f.stored()).toBeNull();
  });
});

describe("reminderView", () => {
  const base = { hasPushManager: true, hasNotification: true, platform: "android", standalone: false, permission: "default" } as const;
  it.each([
    ["can ask", { ...base }, null, "can_ask"],
    ["active: granted and subscribed", { ...base, permission: "granted" }, { id: "x" }, "active"],
    ["granted but no stored subscription: button, no new prompt needed", { ...base, permission: "granted" }, null, "can_ask"],
    ["denied wins over a stored id", { ...base, permission: "denied" }, { id: "x" }, "denied"],
    ["no PushManager", { ...base, hasPushManager: false }, null, "unsupported"],
    ["iOS in Safari tab", { ...base, platform: "ios-safari" }, null, "needs_install"],
    ["iOS installed app", { ...base, platform: "ios-safari", standalone: true }, null, "can_ask"],
  ] as const)("%s", (_n, env, stored, want) => {
    expect(reminderView(env as never, stored as never)).toBe(want);
  });
});
