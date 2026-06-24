import type { ContentItem } from "../modules/contentExtractor";
import type { OutlineNode } from "../modules/outlineBuilder";
import type { BookmarkNode } from "../modules/treeBuilder";

const PathUtils =
  (globalThis as any).PathUtils ||
  {
    join(...parts: string[]): string {
      const sep = parts[0]?.includes("\\") ? "\\" : "/";
      return parts.join(sep);
    },
  };

function isDebugEnabled(): boolean {
  try {
    const prefsPrefix: string =
      (globalThis as any)?.addon?.data?.config?.prefsPrefix ??
      "extensions.zotero.patentplus";
    return !!(globalThis as any).Zotero?.Prefs?.get(
      `${prefsPrefix}.outline.debug`,
      true,
    );
  } catch {
    return false;
  }
}

async function getDebugDir(): Promise<string> {
  const zotero = (globalThis as any).Zotero;

  const baseDir =
    zotero?.DataDirectory?.dir || zotero?.Profile?.dir;
  if (!baseDir) {
    throw new Error(
      "Zotero.DataDirectory.dir is not available",
    );
  }

  const debugDir = PathUtils.join(
    baseDir,
    "patent-outline-generator",
    "debug",
  );

  const io = (globalThis as any).IOUtils;
  if (io?.makeDirectory) {
    await io.makeDirectory(debugDir, {
      createAncestors: true,
    });
  } else if ((globalThis as any)?.OS?.File) {
    await (globalThis as any).OS.File.makeDir(debugDir, {
      exists: true,
      ignoreExisting: true,
    });
  }
  return debugDir;
}

async function writeFile(
  filePath: string,
  content: string,
): Promise<void> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(content);
  const io = (globalThis as any).IOUtils;
  if (io?.write) {
    await io.write(filePath, bytes, {
      tmpPath: filePath + ".tmp",
    });
  } else if ((globalThis as any)?.OS?.File?.write) {
    await (globalThis as any).OS.File.write(filePath, bytes, {
      tmpPath: filePath + ".tmp",
    });
  } else {
    throw new Error(
      "No file writing API available (IOUtils or OS.File)",
    );
  }
}

function buildPath(dir: string, name: string): string {
  return PathUtils.join(dir, name);
}

async function writeJsonFile(
  dir: string,
  filename: string,
  data: any,
): Promise<string | null> {
  if (!isDebugEnabled()) return null;
  try {
    const path = buildPath(dir, filename);
    await writeFile(path, JSON.stringify(data, null, 2));
    return path;
  } catch {
    return null;
  }
}

export async function saveRawContentSample(
  itemId: number,
  items: ContentItem[],
): Promise<string | null> {
  if (!isDebugEnabled()) return null;
  try {
    const dir = await getDebugDir();
    return await writeJsonFile(
      dir,
      `raw_content_sample_${itemId}.json`,
      items,
    );
  } catch {
    return null;
  }
}

export async function savePrompt(
  itemId: number,
  system: string,
  user: string,
): Promise<string | null> {
  if (!isDebugEnabled()) return null;
  try {
    const dir = await getDebugDir();
    const path = buildPath(dir, `prompt_${itemId}.txt`);
    const content = `=== SYSTEM ===\n${system}\n\n=== USER ===\n${user}`;
    await writeFile(path, content);
    return path;
  } catch {
    return null;
  }
}

export async function saveAIResponse(
  itemId: number,
  response: string,
): Promise<string | null> {
  if (!isDebugEnabled()) return null;
  try {
    const dir = await getDebugDir();
    return await writeJsonFile(
      dir,
      `ai_response_${itemId}.json`,
      response,
    );
  } catch {
    return null;
  }
}

export async function saveFinalOutline(
  itemId: number,
  outline: OutlineNode[],
): Promise<string | null> {
  if (!isDebugEnabled()) return null;
  try {
    const dir = await getDebugDir();
    return await writeJsonFile(
      dir,
      `final_outline_${itemId}.json`,
      outline,
    );
  } catch {
    return null;
  }
}

async function writeBinaryFile(
  filePath: string,
  data: Uint8Array,
): Promise<void> {
  const io = (globalThis as any).IOUtils;
  if (io?.write) {
    await io.write(filePath, data, {
      tmpPath: filePath + ".tmp",
    });
  } else {
    throw new Error("IOUtils.write not available for binary output");
  }
}

export async function saveModifiedPdf(
  itemId: number,
  pdfBytes: Uint8Array,
): Promise<string | null> {
  if (!isDebugEnabled()) return null;
  try {
    const dir = await getDebugDir();
    const path = buildPath(dir, `with_outline_${itemId}.pdf`);
    await writeBinaryFile(path, pdfBytes);
    return path;
  } catch {
    return null;
  }
}

export async function saveBookmarkTree(
  itemId: number,
  tree: BookmarkNode[],
): Promise<string | null> {
  if (!isDebugEnabled()) return null;
  try {
    const dir = await getDebugDir();
    return await writeJsonFile(
      dir,
      `bookmark_tree_${itemId}.json`,
      tree,
    );
  } catch {
    return null;
  }
}

export interface WriteLogEntry {
  timestamp: string;
  action: string;
  itemId: number;
  success: boolean;
  details?: string;
}

export async function saveWriteLog(
  itemId: number,
  log: WriteLogEntry,
): Promise<string | null> {
  if (!isDebugEnabled()) return null;
  try {
    const dir = await getDebugDir();
    const path = buildPath(dir, `write_log_${itemId}.json`);

    let existing: WriteLogEntry[] = [];
    try {
      const io = (globalThis as any).IOUtils;
      if (io?.read) {
        const data = await io.read(path);
        const text = new TextDecoder().decode(
          data instanceof Uint8Array ? data : new Uint8Array(data),
        );
        existing = JSON.parse(text);
        if (!Array.isArray(existing)) existing = [];
      }
    } catch {
      // file doesn't exist yet
    }

    existing.push(log);
    await writeFile(path, JSON.stringify(existing, null, 2));
    return path;
  } catch {
    return null;
  }
}