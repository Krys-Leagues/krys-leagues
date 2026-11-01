export async function sourceSha256(bytes: ArrayBuffer | Uint8Array) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const copy = new Uint8Array(source.byteLength)
  copy.set(source)
  const digest = await globalThis.crypto.subtle.digest("SHA-256", copy.buffer)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}
