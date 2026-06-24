import { config } from "../../package.json";

export interface AttachmentDiscoveryResult {
  parentItem: Zotero.Item;
  pdfItem: Zotero.Item | null;
  zipItem: Zotero.Item | null;
  pdfPath: string | null;
  zipPath: string | null;
}

export async function discoverAttachments(
  parentItem: Zotero.Item,
): Promise<AttachmentDiscoveryResult> {
  let attachmentIds: number[];
  try {
    attachmentIds = await parentItem.getAttachments();
  } catch (err) {
    ztoolkit.log("Failed to get attachments:", err);
    attachmentIds = [];
  }

  if (!attachmentIds || attachmentIds.length === 0) {
    return {
      parentItem,
      pdfItem: null,
      zipItem: null,
      pdfPath: null,
      zipPath: null,
    };
  }

  let pdfItem: Zotero.Item | null = null;
  let zipItem: Zotero.Item | null = null;

  for (const id of attachmentIds) {
    const childItem = await Zotero.Items.getAsync(id);
    if (!childItem || !childItem.isAttachment()) continue;

    const contentType = childItem.attachmentContentType;

    if (contentType === "application/pdf") {
      pdfItem = childItem;
    } else if (contentType === "application/zip") {
      zipItem = childItem;
    }
  }

 let pdfPath: string | null = null;
 let zipPath: string | null = null;

  if (pdfItem) {
    try {
      pdfPath = (await pdfItem.getFilePathAsync()) || null;
    } catch (err) {
      ztoolkit.log("Failed to get PDF path:", err);
    }
  }

  if (zipItem) {
    try {
      zipPath = (await zipItem.getFilePathAsync()) || null;
    } catch (err) {
      ztoolkit.log("Failed to get ZIP path:", err);
    }
  }

  return {
    parentItem,
    pdfItem,
    zipItem,
    pdfPath,
    zipPath,
  };
}
