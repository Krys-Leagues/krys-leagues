function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function u16(value: number) { return Uint8Array.from([value & 255, (value >>> 8) & 255]) }
function u32(value: number) { return Uint8Array.from([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]) }
function concat(parts: Uint8Array[]) { const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0)); let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length } return result }

/** Small dependency-free store-only ZIP writer for the private admin batch download. */
export function createStoreZip(entries: Array<{ name: string; bytes: Uint8Array }>) {
  const local: Uint8Array[] = []; const central: Uint8Array[] = []; let offset = 0
  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name); const checksum = crc32(entry.bytes)
    const header = concat([Uint8Array.from([0x50,0x4b,0x03,0x04]), u16(20), u16(0), u16(0), u16(0), u16(0), u32(checksum), u32(entry.bytes.length), u32(entry.bytes.length), u16(name.length), u16(0), name])
    local.push(header, entry.bytes)
    const directory = concat([Uint8Array.from([0x50,0x4b,0x01,0x02]), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(checksum), u32(entry.bytes.length), u32(entry.bytes.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name])
    central.push(directory); offset += header.length + entry.bytes.length
  }
  const centralBytes = concat(central); const localBytes = concat(local)
  const end = concat([Uint8Array.from([0x50,0x4b,0x05,0x06]), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(centralBytes.length), u32(localBytes.length), u16(0)])
  return concat([localBytes, centralBytes, end])
}
