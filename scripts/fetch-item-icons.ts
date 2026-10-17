import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type Item = { id: string; name: string };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(root, "lib/data/game-data.json"), "utf8")) as { items: Item[] };
const outDir = join(root, "public/icons");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const slugAliases: Record<string, string[]> = {
  screw: ["screws"],
};

function slugs(item: Item): string[] {
  const fromName = item.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return [...new Set([item.id, fromName, ...(slugAliases[item.id] ?? [])])];
}

async function className(slug: string): Promise<string | null> {
  const response = await fetch(`https://satisfactorybase.com/wiki/items/${slug}`);
  if (!response.ok) return null;
  const html = await response.text();
  const match = html.match(/icons\/game\/([^"@]+)/);
  return match?.[1] ?? null;
}

async function iconFor(item: Item): Promise<Buffer | null> {
  for (const slug of slugs(item)) {
    const classId = await className(slug);
    if (!classId) continue;
    const response = await fetch(`https://assets.satisfactorybase.com/1.2/icons/game/${classId}@256.webp`);
    if (!response.ok) continue;
    const type = response.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) continue;
    return Buffer.from(await response.arrayBuffer());
  }
  return null;
}

const missing: string[] = [];
let done = 0;
const queue = [...data.items];

async function worker() {
  for (;;) {
    const item = queue.shift();
    if (!item) return;
    const bytes = await iconFor(item);
    done += 1;
    if (bytes) writeFileSync(join(outDir, `${item.id}.webp`), bytes);
    else missing.push(`${item.id} (${item.name})`);
    if (done % 25 === 0) console.log(`${done}/${data.items.length}`);
  }
}

await Promise.all(Array.from({ length: 4 }, () => worker()));
console.log(`saved ${data.items.length - missing.length}, missing ${missing.length}`);
if (missing.length > 0) console.log(missing.join("\n"));
