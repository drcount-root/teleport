import type { WebSocket } from "ws";
import { ROOM_TTL_MS } from "@repo/shared";
import { generateRoomCode } from "./code-generator.js";

interface Room {
  host: WebSocket;
  guest: WebSocket | null;
  createdAt: number;
  connected: boolean;
}

const rooms = new Map<string, Room>();

function generateUniqueCode(): string {
  let code: string;
  do {
    code = generateRoomCode();
  } while (rooms.has(code));
  return code;
}

export const roomManager = {
  create(host: WebSocket): string {
    const code = generateUniqueCode();
    rooms.set(code, {
      host,
      guest: null,
      createdAt: Date.now(),
      connected: false,
    });
    return code;
  },

  join(code: string, guest: WebSocket): boolean {
    const room = rooms.get(code);
    if (!room || room.guest !== null) return false;
    room.guest = guest;
    return true;
  },

  rejoin(code: string, ws: WebSocket): "host" | "guest" | null {
    const room = rooms.get(code);
    if (!room) return null;
    // Determine which peer is rejoining by checking which slot is disconnected
    if (room.host.readyState > 1) {
      room.host = ws;
      return "host";
    }
    if (room.guest === null || room.guest.readyState > 1) {
      room.guest = ws;
      return "guest";
    }
    return null;
  },

  getPeer(code: string, self: WebSocket): WebSocket | null {
    const room = rooms.get(code);
    if (!room) return null;
    if (room.host === self) return room.guest;
    if (room.guest === self) return room.host;
    return null;
  },

  getCode(ws: WebSocket): string | null {
    for (const [code, room] of rooms) {
      if (room.host === ws || room.guest === ws) return code;
    }
    return null;
  },

  markConnected(code: string): void {
    const room = rooms.get(code);
    if (room) room.connected = true;
  },

  delete(code: string): void {
    rooms.delete(code);
  },

  count(): number {
    return rooms.size;
  },

  sweep(): void {
    const cutoff = Date.now() - ROOM_TTL_MS;
    for (const [code, room] of rooms) {
      if (!room.connected && room.createdAt < cutoff) {
        rooms.delete(code);
      }
    }
  },
};

// Safety sweep every 60s for rooms that never connected
setInterval(() => roomManager.sweep(), 60_000);
