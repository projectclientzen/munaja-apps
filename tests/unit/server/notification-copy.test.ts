import { describe, expect, it } from "vitest";
import { COPY_VARIANTS, isFixedCopyType, localDateOf, pickCopy } from "@/server/notifications/copy";

describe("fixed copy variants (owner-approved 17 Nov 2026)", () => {
  it("has the exact approved text for every type", () => {
    expect(COPY_VARIANTS.tahajud).toEqual([
      { title: "Waktunya bangun", body: "Jadwal ibadah malammu dimulai. Pelan-pelan saja, mulai dari yang bisa." },
      { title: "Saatnya bermunajat", body: "Sepertiga malam sudah tiba. Ambil wudhu, mulai dari dua rakaat." },
    ]);
    expect(COPY_VARIANTS.fajr).toEqual([
      { title: "Waktu Subuh masuk", body: "Lanjutkan rangkaian Subuhmu kapan siap." },
      { title: "Subuh sudah tiba", body: "Yuk salat Subuh, lalu lanjutkan amalan pagimu." },
    ]);
    expect(COPY_VARIANTS.alkahfi).toEqual([
      { title: "Malam Jumat", body: "Waktunya membaca Al-Kahfi. Bisa dibaca kapan saja sampai Jumat sore." },
      { title: "Jumat berkah", body: "Jangan lupa Al-Kahfi hari ini, bacanya bisa dicicil." },
    ]);
  });

  it("has no em-dash", () => {
    for (const v of Object.values(COPY_VARIANTS).flat()) expect(`${v.title}${v.body}`).not.toMatch(/[—–]|--/);
  });

  it("is deterministic per date and alternates day by day, including across month ends", () => {
    // 1970-01-01 is day 0 (A). 2026-11-18 is day 20775 (odd, B).
    expect(pickCopy("tahajud", "1970-01-01")).toBe(COPY_VARIANTS.tahajud[0]);
    expect(pickCopy("tahajud", "2026-11-18")).toBe(COPY_VARIANTS.tahajud[1]);
    expect(pickCopy("tahajud", "2026-11-18")).toBe(pickCopy("tahajud", "2026-11-18"));
    const run = ["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"].map((d) => pickCopy("fajr", d));
    for (let i = 1; i < run.length; i++) expect(run[i]).not.toBe(run[i - 1]);
  });

  it("uses the user's local date, not UTC", () => {
    // 2026-11-17 18:00 UTC is already 2026-11-18 01:00 in Jakarta.
    const at = new Date("2026-11-17T18:00:00Z");
    expect(localDateOf(at, "Asia/Jakarta")).toBe("2026-11-18");
    expect(localDateOf(at, "UTC")).toBe("2026-11-17");
  });

  it("only tahajud, fajr and alkahfi use fixed copy", () => {
    expect(["tahajud", "fajr", "alkahfi"].every((t) => isFixedCopyType(t as never))).toBe(true);
    expect(isFixedCopyType("bedtime")).toBe(false);
    expect(isFixedCopyType("achievement")).toBe(false);
  });
});
