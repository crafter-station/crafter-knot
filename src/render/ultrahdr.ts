const SOS = 0xda;
const APP1 = 0xe1;
const APP2 = 0xe2;
const MP_ENTRY = 0xb002;
const LITTLE = 0x4949;
const XMP = "http://ns.adobe.com/xap/1.0/\0";
const MPF = "MPF\0";

export interface GainMap {
  readonly low: number;
  readonly high: number;
  readonly gamma: number;
  readonly offsetSdr: number;
  readonly offsetHdr: number;
}

export interface UltraHdr {
  readonly base: Blob;
  readonly gain: Blob;
  readonly map: GainMap;
}

interface Segment {
  readonly marker: number;
  readonly start: number;
  readonly end: number;
}

function* segments(bytes: Uint8Array, from: number): Generator<Segment> {
  let at = from + 2;
  while (at + 4 <= bytes.length && bytes[at] === 0xff && bytes[at + 1] !== SOS) {
    const end = at + 2 + ((bytes[at + 2] << 8) | bytes[at + 3]);
    yield { marker: bytes[at + 1], start: at + 4, end };
    at = end;
  }
}

const signed = (bytes: Uint8Array, at: number, signature: string) =>
  [...signature].every((char, i) => bytes[at + i] === char.charCodeAt(0));

function images(bytes: Uint8Array): { offset: number; size: number }[] {
  const mpf = [...segments(bytes, 0)].find((s) => s.marker === APP2 && signed(bytes, s.start, MPF));
  if (!mpf) throw new Error("The image has no multi-picture index");
  const tiff = mpf.start + MPF.length;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const little = view.getUint16(tiff) === LITTLE;
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);
  const directory = tiff + u32(tiff + 4);
  const entry = Array.from({ length: u16(directory) }, (_, i) => directory + 2 + i * 12).find(
    (at) => u16(at) === MP_ENTRY,
  );
  if (entry === undefined) throw new Error("The multi-picture index lists no images");
  const table = tiff + u32(entry + 8);
  return Array.from({ length: u32(entry + 4) / 16 }, (_, i) => ({
    offset: i === 0 ? 0 : tiff + u32(table + i * 16 + 8),
    size: u32(table + i * 16 + 4),
  }));
}

function gainMap(bytes: Uint8Array, from: number): GainMap {
  const xmp = [...segments(bytes, from)]
    .filter((s) => s.marker === APP1 && signed(bytes, s.start, XMP))
    .map((s) => new TextDecoder().decode(bytes.subarray(s.start + XMP.length, s.end)))
    .join("");
  if (!xmp.includes("hdrgm:")) throw new Error("The gain map has no hdrgm metadata");
  const read = (name: string, fallback: number) => {
    const match = xmp.match(new RegExp(`hdrgm:${name}(?:="([^"]+)"|>([^<]+)<)`));
    const value = Number(match?.[1] ?? match?.[2]);
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    low: read("GainMapMin", 0),
    high: read("GainMapMax", 1),
    gamma: read("Gamma", 1),
    offsetSdr: read("OffsetSDR", 1 / 64),
    offsetHdr: read("OffsetHDR", 1 / 64),
  };
}

export function readUltraHdr(buffer: ArrayBuffer): UltraHdr {
  const bytes = new Uint8Array(buffer);
  const [primary, gain] = images(bytes);
  if (!gain) throw new Error("The image carries no gain map");
  const jpeg = (from: number, size: number) =>
    new Blob([bytes.subarray(from, from + size)], { type: "image/jpeg" });
  return {
    base: jpeg(0, primary.size),
    gain: jpeg(gain.offset, gain.size),
    map: gainMap(bytes, gain.offset),
  };
}
