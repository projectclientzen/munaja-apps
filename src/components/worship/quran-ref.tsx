"use client";

import { BookOpen, ChevronRight } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { quranText, QURAN_ATTRIBUTION, type SurahText } from "@/data/quran";
import type { QuranRef } from "@/domain/content";

/**
 * Where a Qur'an item of the session leads. A whole surah opens the reader. A few ayat (Ayat Seribu Dinar, 65:2-3)
 * open in a sheet, like niat and dzikir. The ayat come only from the verified Tanzil dataset via `quranText`: if the
 * dataset has nothing, the sheet says so and shows no text.
 */
export function QuranRefLink({ title, note, quran }: { title: string; note: string | null; quran: QuranRef }) {
  const body = (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-medium">{title}</span>
        {note ? <span className="text-helper text-text-muted">{note}</span> : null}
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-text-muted" />
    </span>
  );
  const cls = "flex min-h-12 flex-1 items-center rounded-[var(--radius-control)] py-1 text-start hover:bg-surface-2";

  if (quran.from === null) {
    return (
      <Link href={`/quran/${quran.surah}`} className={cls} aria-label={`Baca ${title}`}>
        {body}
      </Link>
    );
  }
  return (
    <Sheet
      title={title}
      trigger={
        <button type="button" className={cls} aria-label={`Lihat ayat ${title}`}>
          {body}
        </button>
      }
    >
      <AyatBody quran={quran} />
    </Sheet>
  );
}

function AyatBody({ quran }: { quran: QuranRef }) {
  const [state, setState] = React.useState<{ loading: boolean; text: SurahText | null }>({ loading: true, text: null });
  React.useEffect(() => {
    let alive = true;
    void quranText
      .getSurah(quran.surah)
      .then((text) => alive && setState({ loading: false, text }))
      .catch(() => alive && setState({ loading: false, text: null }));
    return () => {
      alive = false;
    };
  }, [quran.surah]);

  if (state.loading) return <Skeleton className="h-40 w-full" />;
  const from = quran.from ?? 1;
  const to = quran.to ?? Number.MAX_SAFE_INTEGER;
  const verses = state.text?.verses.filter((v) => v.number >= from && v.number <= to) ?? [];
  if (verses.length === 0) {
    return (
      <div className="flex flex-col gap-2" data-testid="quran-ref-empty">
        <p className="font-medium">Teks ayat belum tersedia</p>
        <p className="text-text-muted">Buka mushaf cetak atau coba lagi saat online.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4" data-testid="quran-ref-text">
      <ol className="flex flex-col gap-3">
        {verses.map((v) => (
          <li key={v.number} className="flex flex-col gap-1">
            <p
              className="arabic rounded-[var(--radius-control)] bg-surface-2 p-3 text-start text-[1.75rem] leading-[2.1]"
              lang="ar"
              dir="rtl"
            >
              {v.text}
            </p>
            <span className="text-helper text-text-muted">Ayat {v.number}</span>
          </li>
        ))}
      </ol>
      <Link href={`/quran/${quran.surah}`} className="inline-flex min-h-11 items-center gap-2 font-medium underline">
        <BookOpen aria-hidden className="size-5" />
        Buka di Al-Qur&apos;an
      </Link>
      <p className="text-helper text-text-muted">{QURAN_ATTRIBUTION.text}</p>
    </div>
  );
}
