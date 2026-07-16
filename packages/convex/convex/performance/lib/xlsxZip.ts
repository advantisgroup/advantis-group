/**
 * SheetJS 0.18.5 throws "Bad uncompressed size" on .xlsx files whose ZIP
 * entries record their real sizes only in the central directory while the
 * local file headers were written with zeroed size fields (streaming
 * writers, e.g. some Salesforce/Genesys exporters). It reads each entry via
 * the central directory but then rejects the local-vs-central size
 * mismatch. Rewriting each local header's compressed/uncompressed size to
 * the central-directory value and clearing the data-descriptor flag makes
 * that check pass; decompression is unaffected (zlib inflates the whole
 * stream regardless of the size hint) and entries are still located via the
 * central directory. Mutates `bytes` in place; returns how many headers
 * were patched.
 */

const u16 = (b: Uint8Array, o: number): number => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number): number =>
  (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const writeU16 = (b: Uint8Array, o: number, v: number): void => {
  b[o] = v & 0xff;
  b[o + 1] = (v >>> 8) & 0xff;
};
const writeU32 = (b: Uint8Array, o: number, v: number): void => {
  b[o] = v & 0xff;
  b[o + 1] = (v >>> 8) & 0xff;
  b[o + 2] = (v >>> 16) & 0xff;
  b[o + 3] = (v >>> 24) & 0xff;
};

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;
const ZIP64_SENTINEL = 0xffffffff;

/** Locate the ZIP end-of-central-directory record by scanning back from EOF
 * (bounded by the 64 KiB maximum trailing comment). Returns -1 if not
 * found. */
function findEocd(bytes: Uint8Array): number {
  const floor = Math.max(0, bytes.length - 22 - 65536);
  for (let i = bytes.length - 22; i >= floor; i--) {
    if (u32(bytes, i) === EOCD_SIG) return i;
  }
  return -1;
}

export function normalizeZipLocalHeaders(bytes: Uint8Array): number {
  const eocd = findEocd(bytes);
  if (eocd < 0) return 0;

  const count = u16(bytes, eocd + 10);
  let cd = u32(bytes, eocd + 16);
  let patched = 0;

  for (let i = 0; i < count && cd + 46 <= bytes.length; i++) {
    if (u32(bytes, cd) !== CD_SIG) break;
    const cdCsz = u32(bytes, cd + 20);
    const cdUsz = u32(bytes, cd + 24);
    const nameLen = u16(bytes, cd + 28);
    const extraLen = u16(bytes, cd + 30);
    const commentLen = u16(bytes, cd + 32);
    const lho = u32(bytes, cd + 42);
    cd += 46 + nameLen + extraLen + commentLen;

    // ZIP64 keeps the real sizes/offset in extra fields, not these 32-bit
    // slots; leave those entries alone (xlsx is effectively never ZIP64).
    if (
      cdCsz === ZIP64_SENTINEL ||
      cdUsz === ZIP64_SENTINEL ||
      lho === ZIP64_SENTINEL ||
      lho + 30 > bytes.length ||
      u32(bytes, lho) !== LFH_SIG
    ) {
      continue;
    }

    const localFlags = u16(bytes, lho + 6);
    if (
      u32(bytes, lho + 18) !== cdCsz ||
      u32(bytes, lho + 22) !== cdUsz ||
      (localFlags & 0x8) !== 0
    ) {
      writeU16(bytes, lho + 6, localFlags & ~0x8);
      writeU32(bytes, lho + 18, cdCsz);
      writeU32(bytes, lho + 22, cdUsz);
      patched++;
    }
  }
  return patched;
}
