export const CHUNK_SIZE = 262_144              // 256 KB per chunk
export const BUFFER_HIGH_WATERMARK = 4_000_000 // pause sending above this
export const BUFFER_LOW_WATERMARK = 2_000_000  // resume sending below this

export const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 6
export const ROOM_TTL_MS = 300_000             // 5 min — rooms older than this get swept

// WebSocket retry (client → server)
export const WS_RETRY_BASE_MS = 100
export const WS_RETRY_MAX_ATTEMPTS = 5
export const WS_RETRY_MULTIPLIER = 2

// WebRTC ICE restart
export const ICE_RESTART_MAX = 3

// Chunk ACK interval — receiver ACKs every N chunks so sender can track resume point
export const ACK_INTERVAL_CHUNKS = 64
