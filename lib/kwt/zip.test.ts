import assert from 'node:assert/strict'
import test from 'node:test'
import { createStoreZip } from './zip.ts'

test('creates a readable store-only ZIP for a trophy batch', () => {
  const archive = createStoreZip([
    { name: 'STICKY-1.png', bytes: Uint8Array.from([137, 80, 78, 71]) },
    { name: 'LAURENT-2.png', bytes: Uint8Array.from([1, 2, 3]) },
  ])

  assert.deepEqual(Array.from(archive.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04])
  assert.deepEqual(Array.from(archive.slice(-22, -18)), [0x50, 0x4b, 0x05, 0x06])
  assert.ok(new TextDecoder().decode(archive).includes('STICKY-1.png'))
  assert.ok(new TextDecoder().decode(archive).includes('LAURENT-2.png'))
})
