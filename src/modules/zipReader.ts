import { unzipSync } from "fflate";

export interface ContentListEntry {
  text: string;
  page_idx: number;
  text_level: number;
  bbox?: [number, number, number, number];
}

export interface ZipReaderResult {
  entries: ContentListEntry[];
  source: "content_list.json" | "content_list_v2.json" | "full.md";
  rawMd?: string;
}

export async function readContentList(
  zipPath: string,
): Promise<ZipReaderResult> {
  const zipBytes = await readFileBytes(zipPath);
  const files = extractZipFiles(zipBytes);

  const contentListJson = files.find(
    (f) => f.name === "content_list.json",
  );
  if (contentListJson) {
    const text = new TextDecoder("utf-8").decode(contentListJson.data);
    const entries = normalizeEntries(JSON.parse(text));
    return { entries, source: "content_list.json" };
  }

  const contentListV2 = files.find(
    (f) => f.name === "content_list_v2.json",
  );
  if (contentListV2) {
    const text = new TextDecoder("utf-8").decode(contentListV2.data);
    const entries = normalizeEntries(JSON.parse(text));
    return { entries, source: "content_list_v2.json" };
  }

  const fullMd = files.find((f) => /full\.md$/i.test(f.name));
  if (fullMd) {
    const text = new TextDecoder("utf-8").decode(fullMd.data);
    const entries = parseMdHeadings(text);
    return { entries, source: "full.md", rawMd: text };
  }

  throw new Error(
    "No recognizable content file found in MinerU ZIP",
  );
}

function normalizeEntries(raw: any[]): ContentListEntry[] {
  return raw.filter((e): e is ContentListEntry => {
    if (!e || typeof e.text !== "string" || !e.text.trim()) return false;
    return true;
  });
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function extractZipFiles(zipBytes: Uint8Array): ZipEntry[] {
  const unzipped = unzipSync(zipBytes);
  return Object.entries(unzipped)
    .filter(
      ([name]) =>
        !name.startsWith("__MACOSX/") && !name.endsWith("/"),
    )
    .map(([name, data]) => ({
      name,
      data: data as Uint8Array,
    }));
}

function parseMdHeadings(md: string): ContentListEntry[] {
  const lines = md.split("\n");
  const entries: ContentListEntry[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      entries.push({
        text,
        page_idx: 0,
        text_level: level,
      });
    }
  }

  return entries;
}

async function readFileBytes(filePath: string): Promise<Uint8Array> {
  const io = (globalThis as any).IOUtils;
  if (io?.read) {
    const data = await io.read(filePath);
    return data instanceof Uint8Array
      ? data
      : new Uint8Array(data);
  }
  const osFile = (globalThis as any)?.OS?.File;
  if (osFile?.read) {
    const data = await osFile.read(filePath);
    return new Uint8Array(data);
  }
  throw new Error("No file reading API available");
}
