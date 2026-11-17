import { renderTemplate } from "@/domain/notifications/bedtime";
import type { NotificationType } from "@/domain/config/provisional";

/** Where a tap on the notification opens. Always a relative app path (src/server/push/payload.ts enforces it). */
export const NOTIFICATION_URL: Record<NotificationType, string> = {
  bedtime: "/dashboard",
  tahajud: "/worship/session",
  fajr: "/worship/session",
  alkahfi: "/quran/18",
  achievement: "/levels",
};

export interface NotificationContent {
  title: string;
  body: string;
}

/** Fixed-copy types: two owner-approved variants each (owner decision 17 Nov 2026). Index 0 is variant A, 1 is B. */
export type FixedCopyType = "tahajud" | "fajr" | "alkahfi";

export const COPY_VARIANTS: Record<FixedCopyType, readonly [NotificationContent, NotificationContent]> = {
  tahajud: [
    { title: "Waktunya bangun", body: "Jadwal ibadah malammu dimulai. Pelan-pelan saja, mulai dari yang bisa." },
    { title: "Saatnya bermunajat", body: "Sepertiga malam sudah tiba. Ambil wudhu, mulai dari dua rakaat." },
  ],
  fajr: [
    { title: "Waktu Subuh masuk", body: "Lanjutkan rangkaian Subuhmu kapan siap." },
    { title: "Subuh sudah tiba", body: "Yuk salat Subuh, lalu lanjutkan amalan pagimu." },
  ],
  alkahfi: [
    { title: "Malam Jumat", body: "Waktunya membaca Al-Kahfi. Bisa dibaca kapan saja sampai Jumat sore." },
    { title: "Jumat berkah", body: "Jangan lupa Al-Kahfi hari ini, bacanya bisa dicicil." },
  ],
};

export function isFixedCopyType(type: NotificationType): type is FixedCopyType {
  return type === "tahajud" || type === "fajr" || type === "alkahfi";
}

/** The user's calendar date (YYYY-MM-DD) of an instant in their timezone. */
export function localDateOf(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/**
 * Deterministic A/B pick: even day count since 1970-01-01 is A, odd is B. Counting days (not day-of-month) keeps the
 * alternation unbroken across month ends. The same date always gives the same variant, so a retry never changes the text.
 */
export function pickCopy(type: FixedCopyType, localDate: string): NotificationContent {
  const [y, m, d] = localDate.split("-").map(Number);
  const days = Math.floor(Date.UTC(y!, m! - 1, d!) / 86_400_000);
  return COPY_VARIANTS[type][days % 2 === 0 ? 0 : 1];
}

export interface BankTemplate {
  /** Stable key stored in notification_jobs.template_key: the template uuid, or "demo:<n>". */
  key: string;
  title: string;
  body: string;
  demo: boolean;
}

export const DEMO_PREFIX = "demo:";
export const isDemoKey = (key: string): boolean => key.startsWith(DEMO_PREFIX);

/**
 * PLACEHOLDER bedtime messages, labelled DEMO. The owner has not provided the real bank (PRD §15.2 wants 30 to 90
 * approved messages). These are never sent in production: the scheduler only loads them when the deployment opts in
 * (NOTIF_ALLOW_DEMO_BANK=true outside production) and the dispatcher refuses any demo key unless it is allowed.
 */
export const DEMO_BEDTIME_BANK: readonly BankTemplate[] = [1, 2, 3, 4, 5, 6].map((n) => ({
  key: `${DEMO_PREFIX}${n}`,
  title: "[DEMO] Waktunya bersiap tidur",
  body: `[DEMO] Pesan contoh ${n} untuk {nama}. Bank pesan asli belum disediakan.`,
  demo: true,
}));

/** Fills {nama} and {level}. Anything else in the text throws, so an unreviewed variable never ships. */
export function renderBank(t: BankTemplate, vars: { nama: string; level: number }): NotificationContent {
  return { title: renderTemplate(t.title, vars), body: renderTemplate(t.body, vars) };
}

/** What `{nama}` becomes when the user has no display name. */
export const FALLBACK_NAME = "Sahabat";

export function firstName(displayName: string | null | undefined): string {
  const n = displayName?.trim().split(/\s+/)[0];
  return n && n.length > 0 ? n.slice(0, 40) : FALLBACK_NAME;
}
