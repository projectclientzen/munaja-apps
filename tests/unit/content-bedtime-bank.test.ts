import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderBank } from "@/server/notifications/copy";

const file = JSON.parse(readFileSync("content/notif-bedtime.v1.json", "utf8")) as {
  review_status: string;
  items: { no: number; style: "A" | "B"; id: string; title: string; body: string }[];
};
const migration = readFileSync("supabase/migrations/20261119030000_bedtime_bank.sql", "utf8");
const DOLLAR = "$t$";

describe("BEDTIME-BANK owner-approved bedtime messages (18 Nov 2026)", () => {
  it("has 30 published messages, 15 of each style, unique titles and ids", () => {
    expect(file.review_status).toBe("published");
    expect(file.items).toHaveLength(30);
    expect(file.items.filter((i) => i.style === "A")).toHaveLength(15);
    expect(new Set(file.items.map((i) => i.title)).size).toBe(30);
    expect(new Set(file.items.map((i) => i.id)).size).toBe(30);
  });

  it("fits a phone notification and follows the copy rules", () => {
    for (const i of file.items) {
      const t = renderBank({ key: i.id, title: i.title, body: i.body, demo: false }, { nama: "Abdurrahman", level: 2 });
      expect(i.title.length, i.title).toBeLessThanOrEqual(40);
      expect(i.body.length, i.title).toBeLessThanOrEqual(100);
      expect(t.title + t.body).not.toMatch(/[—؀-ۿ]/);
      expect(t.title + t.body).not.toMatch(/\{/);
    }
  });

  it("the migration inserts exactly the texts of the content file", () => {
    for (const i of file.items) {
      expect(migration).toContain(`'${i.id}'::uuid, 'bedtime', ${DOLLAR}${i.title}${DOLLAR}, ${DOLLAR}${i.body}${DOLLAR}`);
    }
  });
});
