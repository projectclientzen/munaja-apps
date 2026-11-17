import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseQuranLatin, quranLatinFor, quranRefKey } from "@/domain/content";

const file = JSON.parse(readFileSync("content/quran-latin.v1.json", "utf8")) as { items: { ref: string; latin: string | null }[] };

describe("QLATIN owner Latin for session Qur'an readings", () => {
  it("keys a range the same way the session reads quran_ref", () => {
    expect(quranRefKey(65, 2, 3)).toBe("65:2-3");
    expect(quranRefKey(56, null, null)).toBe("56");
  });
  it("returns the owner text verbatim for 65:2-3", () => {
    const t = quranLatinFor("65:2-3");
    expect(t?.latin).toBe(file.items.find((i) => i.ref === "65:2-3")!.latin);
  });
  it("holds no Arabic script: the Arabic always comes from Tanzil", () => {
    expect(readFileSync("content/quran-latin.v1.json", "utf8")).not.toMatch(/[\u0600-\u06FF]/);
  });
  it("flags review until the owner publishes it", () => {
    const base = { content_version: "1", approved_by: null, items: [{ ref: "65:2-3", title: "x", latin: "L", translation: null }] };
    expect(parseQuranLatin({ ...base, review_status: "in_review" }).get("65:2-3")?.needsReview).toBe(true);
    expect(parseQuranLatin({ ...base, review_status: "published" }).get("65:2-3")?.needsReview).toBe(false);
  });
});
