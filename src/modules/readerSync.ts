/**
 * Keep Zotero's PDF reader in sync with the PDF file we rewrite on disk.
 *
 * A PDF that is open in a reader tab keeps the file handle alive, which can
 * make the write fail on Windows, and even when the write succeeds the reader
 * keeps showing the outline it loaded at open time. Closing the affected
 * reader tabs before writing and reopening them afterwards solves both.
 */

export interface ReaderSnapshot {
  tabID: string;
  pageIndex: number;
}

/** Close every reader tab showing `attachmentID` and remember where it was. */
export function closeOpenReaders(attachmentID: number): ReaderSnapshot[] {
  const snapshots: ReaderSnapshot[] = [];

  let readers: any[] = [];
  try {
    readers = (Zotero.Reader as any)?._readers ?? [];
  } catch (err) {
    ztoolkit.log("[readerSync] failed to enumerate readers", err);
    return snapshots;
  }

  for (const reader of readers) {
    if (reader?.itemID !== attachmentID) continue;

    const tabID: string | undefined = reader.tabID;
    const pageIndex: number = reader.state?.pageIndex ?? 0;
    if (!tabID) continue;

    try {
      (globalThis as any).Zotero_Tabs?.close(tabID);
      snapshots.push({ tabID, pageIndex });
    } catch (err) {
      ztoolkit.log("[readerSync] failed to close reader tab", tabID, err);
    }
  }

  return snapshots;
}

/** Reopen the reader tabs closed by {@link closeOpenReaders}. */
export async function reopenReaders(
  attachmentID: number,
  snapshots: ReaderSnapshot[],
): Promise<void> {
  if (!snapshots.length) return;

  // Wait for the reader instances to be torn down (and the PDF file handle
  // released) before opening the file again, otherwise the old tab may still
  // be closing when the new one is created.
  await waitForReadersClosed(snapshots);

  for (const snapshot of snapshots) {
    try {
      await Zotero.Reader.open(attachmentID, {
        pageIndex: snapshot.pageIndex,
      });
    } catch (err) {
      ztoolkit.log("[readerSync] failed to reopen reader", attachmentID, err);
    }
  }
}

async function waitForReadersClosed(
  snapshots: ReaderSnapshot[],
  timeout = 3000,
): Promise<void> {
  const tabIDs = new Set(snapshots.map((snapshot) => snapshot.tabID));
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    let stillOpen = false;
    try {
      const readers = (Zotero.Reader as any)?._readers ?? [];
      stillOpen = readers.some((reader: any) => tabIDs.has(reader?.tabID));
    } catch {
      stillOpen = false;
    }
    if (!stillOpen) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
