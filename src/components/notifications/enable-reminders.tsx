"use client";

import * as React from "react";
import { InstallGuide } from "@/components/pwa/install-guide";
import { DemoBadge } from "@/components/brand/demo-badge";
import { errorMessage, useData } from "@/components/providers/data-provider";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import type { LiveExtras } from "@/data";
import { detectPlatform, isStandalone, type InstallPlatform } from "@/offline/platform";
import {
  disableReminders,
  enableReminders,
  reminderView,
  type PushClientDeps,
  type ReminderView,
  type StoredSubscription,
} from "./push-client";

const SW_WAIT_MS = 5000;

function readEnv() {
  const nav = navigator as Navigator & { standalone?: boolean };
  const platform = detectPlatform({ userAgent: nav.userAgent, maxTouchPoints: nav.maxTouchPoints, platform: nav.platform });
  return {
    platform,
    env: {
      hasPushManager: "PushManager" in window,
      hasNotification: "Notification" in window,
      platform,
      standalone: isStandalone({ matchMedia: (q) => window.matchMedia(q), navigatorStandalone: nav.standalone }),
      permission: "Notification" in window ? Notification.permission : null,
    },
  };
}

const storageKey = (userId: string) => `munajaa.push-sub.${userId}`;

function makeStore(userId: string): PushClientDeps["store"] {
  return {
    read() {
      try {
        const v = JSON.parse(localStorage.getItem(storageKey(userId)) ?? "null") as StoredSubscription | null;
        return v && typeof v.id === "string" ? v : null;
      } catch {
        return null;
      }
    },
    write(v) {
      try {
        localStorage.setItem(storageKey(userId), JSON.stringify(v));
      } catch {
        /* private mode: the button simply stays */
      }
    },
    clear() {
      try {
        localStorage.removeItem(storageKey(userId));
      } catch {
        /* nothing to clear */
      }
    },
  };
}

async function registration() {
  if (!("serviceWorker" in navigator)) return null;
  // `ready` never settles when no worker is registered (dev builds), so do not wait forever.
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), SW_WAIT_MS)),
  ]);
}

const DENIED_HELP: Record<InstallPlatform, string> = {
  android: "Ketuk ikon gembok di sebelah alamat, pilih Izin, lalu Notifikasi, dan ubah ke Izinkan. Setelah itu muat ulang halaman.",
  "ios-safari": "Buka Pengaturan di iPhone, pilih Notifikasi, cari Munajaa, lalu nyalakan Izinkan Notifikasi.",
  "ios-other": "Buka Pengaturan di iPhone, pilih Notifikasi, cari Munajaa, lalu nyalakan Izinkan Notifikasi.",
  "desktop-chromium": "Klik ikon gembok di sebelah alamat, ubah Notifikasi ke Izinkan, lalu muat ulang halaman.",
  "desktop-other": "Buka pengaturan situs di browser, ubah izin Notifikasi ke Izinkan, lalu muat ulang halaman.",
};

/**
 * Button and status for push reminders. Asks for permission only after a tap. Used on the dashboard card, in
 * Settings and on the notifications screen. `onChange` fires after the state flips so a parent can refresh.
 */
export function EnableReminders({ onChange }: { onChange?: () => void }) {
  const { layer, userId, bump } = useData();
  const [view, setView] = React.useState<ReminderView | null>(null);
  const [platform, setPlatform] = React.useState<InstallPlatform>("desktop-other");
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<{ tone: "info" | "error"; text: string } | null>(null);

  const store = React.useMemo(() => makeStore(userId), [userId]);
  const refresh = React.useCallback(() => {
    const r = readEnv();
    setPlatform(r.platform);
    setView(reminderView(r.env, store.read()));
  }, [store]);
  React.useEffect(refresh, [refresh]);

  const deps = React.useCallback((): PushClientDeps | null => {
    if (!layer) return null;
    return {
      mode: layer.mode,
      push: (layer as Partial<LiveExtras>).push,
      permission: () => ("Notification" in window ? Notification.permission : null),
      requestPermission: () => Notification.requestPermission(),
      registration,
      store,
    };
  }, [layer, store]);

  async function run(fn: (d: PushClientDeps) => Promise<void>) {
    const d = deps();
    if (!d || busy) return;
    setBusy(true);
    setNote(null);
    try {
      await fn(d);
    } catch (e) {
      setNote({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
      refresh();
      onChange?.();
      bump();
    }
  }

  const enable = () =>
    run(async (d) => {
      const r = await enableReminders(d);
      if (r.kind === "unavailable") setNote({ tone: "info", text: "Pengingat belum tersedia." });
      if (r.kind === "no_worker")
        setNote({ tone: "error", text: "Layanan pengingat belum siap. Muat ulang halaman, lalu coba lagi." });
      if (r.kind === "dismissed") setNote({ tone: "info", text: "Izin belum diberikan. Kamu bisa mencoba lagi kapan saja." });
    });
  const disable = () => run(disableReminders);

  if (view === null) return null;
  return (
    <div className="flex flex-col gap-3" data-testid="enable-reminders" data-view={view}>
      {view === "needs_install" ? (
        <>
          <p>Pasang Munajaa di layar utama dulu, lalu aktifkan pengingat.</p>
          <Sheet
            title="Pasang di layar utama"
            description="Langkah singkat sesuai perangkatmu."
            trigger={<Button variant="secondary">Lihat panduan pasang</Button>}
          >
            <InstallGuide />
          </Sheet>
        </>
      ) : null}
      {view === "unsupported" ? (
        <p>Browser ini belum mendukung pengingat. Pakai alarm di perangkat sebagai gantinya.</p>
      ) : null}
      {view === "denied" ? (
        <>
          <p>Izin notifikasi ditolak. Pengingat tidak bisa menyala sampai izinnya dibuka.</p>
          <p className="text-text-muted">{DENIED_HELP[platform]}</p>
        </>
      ) : null}
      {view === "can_ask" ? (
        <>
          <p className="text-text-muted">Browser akan meminta izin setelah kamu mengetuk tombol ini.</p>
          <Button className="self-start" onClick={enable} disabled={busy}>
            Aktifkan pengingat
          </Button>
        </>
      ) : null}
      {view === "active" ? (
        <>
          <p role="status">Pengingat aktif di perangkat ini.</p>
          <Button variant="secondary" className="self-start" onClick={disable} disabled={busy}>
            Matikan pengingat
          </Button>
        </>
      ) : null}
      {layer?.mode === "mock" && (view === "can_ask" || view === "active") ? <DemoBadge className="self-start" /> : null}
      {note ? (
        <p role={note.tone === "error" ? "alert" : "status"} className={note.tone === "error" ? "text-error" : "text-text-muted"}>
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
