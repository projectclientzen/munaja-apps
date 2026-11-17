import latinJson from "@content/quran-latin.v1.json";
import { z } from "zod";

/**
 * Owner-supplied Latin (and, later, translation) for the Qur'an readings of the session, by reference ("65:2-3").
 * Only Latin lives here. The Arabic always comes from the verified Tanzil dataset, never from this file.
 */
const fileSchema = z.object({
  content_version: z.string(),
  review_status: z.string(),
  approved_by: z.string().nullable(),
  items: z.array(
    z.object({
      ref: z.string().regex(/^\d{1,3}:\d{1,3}(-\d{1,3})?$/),
      title: z.string(),
      latin: z.string().nullable(),
      translation: z.string().nullable(),
    }),
  ),
});

export interface QuranLatin {
  latin: string | null;
  translation: string | null;
  /** True while the owner has not approved the text: the UI shows the review badge. */
  needsReview: boolean;
}

export const quranRefKey = (surah: number, from: number | null, to: number | null): string =>
  from === null ? String(surah) : to !== null && to !== from ? `${surah}:${from}-${to}` : `${surah}:${from}`;

export function parseQuranLatin(raw: unknown): Map<string, QuranLatin> {
  const f = fileSchema.parse(raw);
  const needsReview = f.review_status !== "published";
  const blank = (s: string | null) => (s && s.trim() !== "" ? s : null);
  return new Map(
    f.items.map((i) => [i.ref, { latin: blank(i.latin), translation: blank(i.translation), needsReview }]),
  );
}

let cached: Map<string, QuranLatin> | null = null;
export function quranLatinFor(key: string): QuranLatin | null {
  cached ??= parseQuranLatin(latinJson);
  return cached.get(key) ?? null;
}
