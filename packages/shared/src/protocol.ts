// Binary frame format: [4 bytes Uint32BE chunkIndex][N bytes payload]

export function encodeChunk(chunkIndex: number, payload: ArrayBuffer): ArrayBuffer {
  const frame = new ArrayBuffer(4 + payload.byteLength)
  const view = new DataView(frame)
  view.setUint32(0, chunkIndex, false) // big-endian
  new Uint8Array(frame).set(new Uint8Array(payload), 4)
  return frame
}

export function decodeChunk(frame: ArrayBuffer): { chunkIndex: number; payload: ArrayBuffer } {
  const view = new DataView(frame)
  const chunkIndex = view.getUint32(0, false) // big-endian
  const payload = frame.slice(4)
  return { chunkIndex, payload }
}
