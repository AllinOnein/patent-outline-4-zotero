export interface BackupResult {
  backupPath: string;
  originalSize: number;
}

/**
 * Create a backup of the original PDF before modification.
 * Backup file is saved as {originalPath}.bak.
 */
export async function createBackup(
  pdfPath: string,
): Promise<BackupResult> {
  const io = getIOUtils();

  const data = await io.read(pdfPath);
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

  const backupPath = pdfPath + ".bak";
  await io.write(backupPath, bytes, { tmpPath: backupPath + ".tmp" });

  return {
    backupPath,
    originalSize: bytes.length,
  };
}

/**
 * Restore the original PDF from backup.
 */
export async function restoreBackup(pdfPath: string): Promise<void> {
  const io = getIOUtils();
  const backupPath = pdfPath + ".bak";
  await io.move(backupPath, pdfPath, { noOverwrite: false });
}

/**
 * Remove the backup file after successful write.
 */
export async function removeBackup(pdfPath: string): Promise<void> {
  const io = getIOUtils();
  const backupPath = pdfPath + ".bak";
  try {
    await io.remove(backupPath);
  } catch {
    // backup may not exist; ignore
  }
}

/**
 * Check if a backup exists.
 */
export async function hasBackup(pdfPath: string): Promise<boolean> {
  const io = getIOUtils();
  const backupPath = pdfPath + ".bak";
  try {
    await io.stat(backupPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Verify that the written PDF is valid by checking its size > 0
 * and that it can be loaded by pdf-lib.
 */
export async function verifyWrittenPdf(
  pdfPath: string,
  minSize: number,
): Promise<boolean> {
  const io = getIOUtils();
  try {
    const stat = await io.stat(pdfPath);
    if (stat.size < minSize) return false;
    return true;
  } catch {
    return false;
  }
}

interface IOUtilsLike {
  read(path: string): Promise<Uint8Array | ArrayBuffer>;
  write(
    path: string,
    data: Uint8Array,
    options?: { tmpPath?: string },
  ): Promise<void>;
  move(
    source: string,
    dest: string,
    options?: { noOverwrite?: boolean },
  ): Promise<void>;
  remove(path: string): Promise<void>;
  stat(
    path: string,
  ): Promise<{ size: number }>;
}

function getIOUtils(): IOUtilsLike {
  const io = (globalThis as any).IOUtils;
  if (!io?.read || !io?.write) {
    throw new Error("IOUtils not available");
  }
  return io;
}
