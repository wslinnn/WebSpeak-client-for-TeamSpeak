/** ZIP container layer for .wskin skin packages: strict central-directory
 *  inspection (sizes, compression, path and file-type sanity) before any
 *  content parsing happens. Throws SkinPackError with machine-readable codes. */

const MAX_EXPANDED_BYTES = 50 * 1024 * 1024;
const MAX_FILE_COUNT = 128;
const ZIP_EOCD = 0x06054b50;
const ZIP_CENTRAL_FILE = 0x02014b50;

const decoder = new TextDecoder("utf-8", { fatal: true });

export class SkinPackError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "SkinPackError";
  }
}

export interface ZipEntryMetadata {
  path: string;
  compressedSize: number;
  expandedSize: number;
  compression: number;
  isDirectory: boolean;
  flags: number;
  crc: number;
  localOffset: number;
}

export function inspectZip(bytes: Uint8Array): ZipEntryMetadata[] {
  if (bytes.byteLength < 22) throw new SkinPackError("The selected file is not a valid ZIP package.", "SKIN_ZIP_INVALID");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minOffset = Math.max(0, bytes.byteLength - 22 - 0xffff);
  let eocd = -1;
  for (let offset = bytes.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) === ZIP_EOCD) { eocd = offset; break; }
  }
  if (eocd < 0) throw new SkinPackError("The selected file is not a valid ZIP package.", "SKIN_ZIP_INVALID");
  const disk = view.getUint16(eocd + 4, true);
  const centralDisk = view.getUint16(eocd + 6, true);
  const entriesOnDisk = view.getUint16(eocd + 8, true);
  const entryCount = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  const commentLength = view.getUint16(eocd + 20, true);
  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount || !entryCount || entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff || eocd + 22 + commentLength !== bytes.byteLength) {
    throw new SkinPackError("Multi-disk and ZIP64 skin packages are not supported.", "SKIN_ZIP_FORMAT");
  }
  if (entryCount > MAX_FILE_COUNT || centralOffset + centralSize !== eocd) throw new SkinPackError("The package contains too many files or an invalid directory.", "SKIN_FILE_COUNT");

  const entries: ZipEntryMetadata[] = [];
  const seenPaths = new Set<string>();
  let expandedTotal = 0;
  let compressedTotal = 0;
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > eocd || view.getUint32(offset, true) !== ZIP_CENTRAL_FILE) throw new SkinPackError("The package has an invalid ZIP directory entry.", "SKIN_ZIP_INVALID");
    const flags = view.getUint16(offset + 8, true);
    const compression = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const expandedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentSize = view.getUint16(offset + 32, true);
    const diskStart = view.getUint16(offset + 34, true);
    const externalAttributes = view.getUint32(offset + 38, true);
    const localOffset = view.getUint32(offset + 42, true);
    const recordEnd = offset + 46 + nameLength + extraLength + commentSize;
    if (recordEnd > eocd || diskStart !== 0 || flags & ~0x0800 || (compression !== 0 && compression !== 8) || compressedSize === 0xffffffff || expandedSize === 0xffffffff || localOffset === 0xffffffff) throw new SkinPackError("Encrypted, multi-disk, and unsupported ZIP entries are not allowed.", "SKIN_ZIP_FORMAT");
    const unixFileType = (externalAttributes >>> 16) & 0xf000;
    if (unixFileType !== 0 && unixFileType !== 0x8000 && unixFileType !== 0x4000) throw new SkinPackError("Only regular files and directories are allowed in a skin package.", "SKIN_FILE_TYPE");
    let rawName: string;
    try { rawName = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)); }
    catch { throw new SkinPackError("A package path is not valid UTF-8.", "SKIN_PATH_INVALID"); }
    const path = validateArchivePath(rawName);
    const isDirectory = path.endsWith("/");
    if ((unixFileType === 0x4000) !== isDirectory && unixFileType !== 0) throw new SkinPackError("ZIP file type does not match its path.", "SKIN_FILE_TYPE");
    if (isDirectory && (compressedSize !== 0 || expandedSize !== 0)) throw new SkinPackError("ZIP directory entries cannot contain data.", "SKIN_ZIP_INVALID");
    if (compression === 0 && compressedSize !== expandedSize) throw new SkinPackError("A stored ZIP entry has inconsistent sizes.", "SKIN_ZIP_INVALID");
    if (seenPaths.has(path.toLowerCase())) throw new SkinPackError("The package contains duplicate or case-conflicting paths.", "SKIN_PATH_DUPLICATE");
    seenPaths.add(path.toLowerCase());
    expandedTotal += expandedSize;
    compressedTotal += compressedSize;
    if (expandedTotal > MAX_EXPANDED_BYTES) throw new SkinPackError("The expanded skin package must be smaller than 50 MiB.", "SKIN_EXPANDED_SIZE");
    if (expandedSize > 1024 * 1024 && expandedSize > Math.max(compressedSize, 1) * 250) throw new SkinPackError("The package has an abnormal compression ratio.", "SKIN_COMPRESSION_RATIO");
    entries.push({ path, compressedSize, expandedSize, compression, isDirectory, flags, crc: view.getUint32(offset + 16, true), localOffset });
    offset = recordEnd;
  }
  if (offset !== centralOffset + centralSize || compressedTotal > bytes.byteLength) throw new SkinPackError("The package directory is inconsistent.", "SKIN_ZIP_INVALID");
  validateLocalEntries(bytes, entries, centralOffset);
  return entries;
}

function validateLocalEntries(bytes: Uint8Array, entries: ZipEntryMetadata[], centralOffset: number): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const spans: Array<{ start: number; end: number }> = [];
  for (const entry of entries) {
    const offset = entry.localOffset;
    if (offset + 30 > centralOffset || view.getUint32(offset, true) !== 0x04034b50) throw new SkinPackError("A ZIP local file header is invalid.", "SKIN_ZIP_INVALID");
    const flags = view.getUint16(offset + 6, true);
    const compression = view.getUint16(offset + 8, true);
    const crc = view.getUint32(offset + 14, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const expandedSize = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const headerEnd = offset + 30 + nameLength + extraLength;
    if (headerEnd > centralOffset || flags !== entry.flags || compression !== entry.compression || crc !== entry.crc || compressedSize !== entry.compressedSize || expandedSize !== entry.expandedSize) {
      throw new SkinPackError("ZIP local and central headers disagree.", "SKIN_ZIP_INVALID");
    }
    let localPath: string;
    try { localPath = decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLength)); }
    catch { throw new SkinPackError("A package path is not valid UTF-8.", "SKIN_PATH_INVALID"); }
    if (localPath !== entry.path) throw new SkinPackError("ZIP local and central filenames disagree.", "SKIN_ZIP_INVALID");
    const end = headerEnd + entry.compressedSize;
    if (end > centralOffset) throw new SkinPackError("A ZIP entry overlaps the central directory.", "SKIN_ZIP_INVALID");
    spans.push({ start: offset, end });
  }
  spans.sort((left, right) => left.start - right.start);
  for (let index = 1; index < spans.length; index += 1) {
    if (spans[index].start < spans[index - 1].end) throw new SkinPackError("ZIP local file entries overlap.", "SKIN_ZIP_INVALID");
  }
}

export function validateArchivePath(rawPath: string): string {
  if (!rawPath || rawPath.includes("\\") || rawPath.startsWith("/") || /^[a-z]:/i.test(rawPath) || rawPath.includes("\0")) {
    throw new SkinPackError("The package contains an absolute or unsafe path.", "SKIN_PATH_INVALID");
  }
  const segments = rawPath.split("/");
  const directory = segments.at(-1) === "";
  const usableSegments = directory ? segments.slice(0, -1) : segments;
  if (!usableSegments.length || usableSegments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes(":"))) {
    throw new SkinPackError("The package contains an unsafe path segment.", "SKIN_PATH_INVALID");
  }
  return usableSegments.join("/") + (directory ? "/" : "");
}

export function findSingleRootFolder(paths: string[]): string {
  if (paths.includes("manifest.json")) return "";
  const firstSegments = paths.map((path) => path.split("/")[0]);
  const candidate = firstSegments[0];
  if (!candidate || !paths.every((path) => path.startsWith(`${candidate}/`))) return "";
  return `${candidate}/`;
}
