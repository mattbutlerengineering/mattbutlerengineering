import { inflateRawSync } from "node:zlib";

/**
 * Minimal, dependency-free ZIP reader scoped to exactly what's needed to
 * read a GitHub Actions artifact download (`actions/upload-artifact`
 * produces a plain STORE/DEFLATE zip, no encryption, no multi-disk
 * archives) — not a general-purpose unzip implementation.
 *
 * Reads the End Of Central Directory record to locate the central
 * directory, then each central directory file header to find every
 * entry's local file header (name + compression method + data offset).
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT_SIZE = 65535;

function findEndOfCentralDirectory(buf) {
  const searchStart = Math.max(0, buf.length - EOCD_MIN_SIZE - MAX_COMMENT_SIZE);
  for (let offset = buf.length - EOCD_MIN_SIZE; offset >= searchStart; offset--) {
    if (buf.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  throw new Error("extractZipEntries: not a valid zip (End Of Central Directory not found)");
}

/**
 * @param {Buffer} buf - raw bytes of a zip archive
 * @returns {Array<{ name: string, data: Buffer }>} every file entry (directory entries omitted)
 */
export function extractZipEntries(buf) {
  const eocdOffset = findEndOfCentralDirectory(buf);
  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  let centralDirOffset = buf.readUInt32LE(eocdOffset + 16);

  const entries = [];
  for (let i = 0; i < totalEntries; i++) {
    if (buf.readUInt32LE(centralDirOffset) !== CENTRAL_DIR_SIGNATURE) {
      throw new Error("extractZipEntries: malformed central directory entry");
    }
    const compressionMethod = buf.readUInt16LE(centralDirOffset + 10);
    const compressedSize = buf.readUInt32LE(centralDirOffset + 20);
    const filenameLength = buf.readUInt16LE(centralDirOffset + 28);
    const extraLength = buf.readUInt16LE(centralDirOffset + 30);
    const commentLength = buf.readUInt16LE(centralDirOffset + 32);
    const localHeaderOffset = buf.readUInt32LE(centralDirOffset + 42);
    const name = buf.toString(
      "utf-8",
      centralDirOffset + 46,
      centralDirOffset + 46 + filenameLength
    );

    if (!name.endsWith("/")) {
      const localFilenameLength = buf.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buf.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localFilenameLength + localExtraLength;
      const compressedData = buf.subarray(dataStart, dataStart + compressedSize);
      const data = compressionMethod === 0 ? compressedData : inflateRawSync(compressedData);
      entries.push({ name, data });
    }

    centralDirOffset += 46 + filenameLength + extraLength + commentLength;
  }
  return entries;
}
