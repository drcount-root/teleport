import type { WebSocket } from "ws";
import type { SignalMessage } from "@repo/shared";
import type { roomManager as RoomManagerType } from "./room-manager.js";

type RoomManager = typeof RoomManagerType;

function send(ws: WebSocket, msg: SignalMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function signalHandler(ws: WebSocket, rm: RoomManager): void {
  ws.on("message", (raw) => {
    let msg: SignalMessage;
    try {
      msg = JSON.parse(raw.toString()) as SignalMessage;
    } catch {
      return;
    }

    switch (msg.type) {
      case "create": {
        const code = rm.create(ws);
        send(ws, { type: "created", code });
        break;
      }

      case "join": {
        const ok = rm.join(msg.code, ws);
        if (!ok) {
          send(ws, { type: "error", reason: "Room not found or full" });
          return;
        }
        send(ws, { type: "joined" });
        const peer = rm.getPeer(msg.code, ws);
        if (peer) send(peer, { type: "joined" });
        break;
      }

      case "rejoin": {
        const role = rm.rejoin(msg.code, ws);
        if (!role) {
          send(ws, { type: "error", reason: "Room not found" });
          return;
        }
        send(ws, { type: "rejoined" });
        const peer = rm.getPeer(msg.code, ws);
        if (peer) send(peer, { type: "rejoined" });
        break;
      }

      case "signal": {
        const code = rm.getCode(ws);
        if (!code) return;
        const peer = rm.getPeer(code, ws);
        if (peer) send(peer, { type: "signal", data: msg.data });
        break;
      }

      case "ready": {
        const code = rm.getCode(ws);
        if (!code) return;
        const peer = rm.getPeer(code, ws);
        if (peer) send(peer, { type: "ready" });
        rm.markConnected(code);
        // Room stays in map so rejoin still works; sweep handles eventual cleanup
        break;
      }

      default:
        break;
    }
  });

  ws.on("close", () => {
    const code = rm.getCode(ws);
    if (!code) return;
    const peer = rm.getPeer(code, ws);
    if (peer) send(peer, { type: "peer-left" });
    rm.delete(code);
  });

  ws.on("error", () => {
    const code = rm.getCode(ws);
    if (code) rm.delete(code);
  });
}
