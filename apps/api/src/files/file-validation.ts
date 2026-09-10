import { AppException } from "../common/app-exception";

export type SupportedFileKind = "pdf" | "txt" | "md" | "docx";

const EXTENSION_TO_KIND: Record<string, SupportedFileKind> = {
  ".pdf": "pdf",
  ".txt": "txt",
  ".md": "md",
  ".markdown": "md",
  ".docx": "docx",
};

/**
 * Reverse lookup used by document-processing (Phase 8) to determine how
 * to extract text from an already-stored file, given the extension
 * embedded in its `storedObjectKey` (see FilesService#uploadFile).
 * Returns `null` for an unrecognized extension.
 */
export function kindFromExtension(extension: string): SupportedFileKind | null {
  return EXTENSION_TO_KIND[extension.toLowerCase()] ?? null;
}

/**
 * Executable/binary-container signatures, checked regardless of the
 * uploaded file's claimed extension — a `.pdf`-named Windows executable
 * is still rejected. This list is deliberately conservative (common
 * formats only); it is a defense-in-depth check, not a substitute for
 * the extension allowlist below.
 */
const EXECUTABLE_SIGNATURES: Array<{ name: string; matches: (buf: Buffer) => boolean }> = [
  { name: "Windows PE/EXE/DLL", matches: (b) => b.length >= 2 && b[0] === 0x4d && b[1] === 0x5a },
  {
    name: "ELF (Linux executable)",
    matches: (b) => b.length >= 4 && b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46,
  },
  {
    name: "Mach-O (macOS executable)",
    matches: (b) => {
      if (b.length < 4) return false;
      const magic = b.readUInt32BE(0);
      return [0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca].includes(magic);
    },
  },
  { name: "Shebang script", matches: (b) => b.length >= 2 && b[0] === 0x23 && b[1] === 0x21 },
];

function looksExecutable(buffer: Buffer): boolean {
  return EXECUTABLE_SIGNATURES.some((signature) => signature.matches(buffer));
}

function extensionOf(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx).toLowerCase();
}

function matchesMagicNumber(kind: SupportedFileKind, buffer: Buffer): boolean {
  switch (kind) {
    case "pdf":
      return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
    case "docx":
      // DOCX is a ZIP container; check the ZIP local-file-header
      // signature ("PK\x03\x04", or the empty/spanned variants).
      return (
        buffer.length >= 4 &&
        buffer[0] === 0x50 &&
        buffer[1] === 0x4b &&
        (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)
      );
    case "txt":
    case "md":
      // No reliable magic number for plain text. The executable check
      // above is the real gate for these; this just rejects obvious
      // binary garbage (a NUL byte essentially never appears in real
      // UTF-8/ASCII text).
      return !buffer.subarray(0, 512).includes(0x00);
  }
}

export interface ValidatedFile {
  kind: SupportedFileKind;
  extension: string;
}

/**
 * Validates an uploaded file's original filename and content.
 *
 * - Rejects filenames containing path separators or `..` outright. The
 *   original filename is only ever stored as a DB column for display —
 *   it is never used to build a filesystem path (FilesService builds
 *   storage keys from server-generated ids instead) — but a filename
 *   attempting to escape its directory is still a sign of a malicious
 *   or malformed upload.
 * - Rejects known executable/binary-container signatures regardless of
 *   claimed extension.
 * - Rejects extensions outside the supported set (PDF, TXT, Markdown,
 *   DOCX).
 * - Cross-checks the file's actual content (magic number) against its
 *   claimed type — the client-supplied MIME type is never trusted
 *   alone.
 *
 * Throws `AppException` on any failure.
 */
export function validateUpload(originalFilename: string, buffer: Buffer): ValidatedFile {
  if (!originalFilename || originalFilename.includes("\u0000")) {
    throw new AppException(400, "INVALID_FILE", "Invalid file name.");
  }

  if (originalFilename.includes("..") || originalFilename.includes("/") || originalFilename.includes("\\")) {
    throw new AppException(400, "INVALID_FILE", "File name must not contain path separators.");
  }

  if (looksExecutable(buffer)) {
    throw new AppException(415, "EXECUTABLE_REJECTED", "Executable files are not allowed.");
  }

  const extension = extensionOf(originalFilename);
  const kind = EXTENSION_TO_KIND[extension];
  if (!kind) {
    throw new AppException(
      415,
      "UNSUPPORTED_FILE_TYPE",
      "Unsupported file type. Allowed formats: PDF, TXT, Markdown, DOCX.",
    );
  }

  if (!matchesMagicNumber(kind, buffer)) {
    throw new AppException(415, "FILE_CONTENT_MISMATCH", "The file's content does not match its extension.");
  }

  return { kind, extension };
}

export function mimeTypeForKind(kind: SupportedFileKind): string {
  switch (kind) {
    case "pdf":
      return "application/pdf";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "txt":
      return "text/plain";
    case "md":
      return "text/markdown";
  }
}
