"use client";

import { useEffect, useRef } from "react";
import type { WorkerInbound } from "@repo/shared";
import { SignalingClient } from "../lib/signaling-client";
import { getIceServers } from "../lib/ice-config";
import { useConnectionStore } from "../stores/connection.store";

const SIGNALING_URL =
  process.env.NEXT_PUBLIC_SIGNALING_URL ?? "ws://localhost:3001/signal";

export function useSignaling(postToWorker: (msg: WorkerInbound) => void) {
  const clientRef = useRef<SignalingClient | null>(null);
  const { setPhase, setRoomCode, setWsRetryCount, setError } =
    useConnectionStore();

  useEffect(() => {
    const client = new SignalingClient(SIGNALING_URL);

    client.onMessage((msg) => {
      switch (msg.type) {
        case "created":
          setRoomCode(msg.code);
          client.setRoomCode(msg.code);
          setPhase("signaling");
          // We are the offerer — init WebRTC and create offer
          postToWorker({ type: "init-offer", iceServers: getIceServers() });
          break;

        case "joined":
          setPhase("signaling");
          // Answerer — wait for offerer's signal message
          break;

        case "rejoined":
          setPhase("reconnecting");
          break;

        case "signal": {
          const data = msg.data;
          // Distinguish offer SDP vs answer SDP vs ICE candidate
          if ("sdp" in data) {
            if ((data as { type: string }).type === "offer") {
              postToWorker({
                type: "init-answer",
                iceServers: getIceServers(),
                offer: data,
              });
            } else {
              postToWorker({ type: "set-remote-desc", desc: data });
            }
          } else if ("candidate" in data) {
            postToWorker({ type: "add-ice", candidate: data });
          }
          break;
        }

        case "ready":
          setPhase("connected");
          break;

        case "peer-left":
          setPhase("error");
          setError("Peer disconnected");
          break;

        case "error":
          setPhase("error");
          setError(msg.reason);
          break;
      }
    });

    client.onRetry((count) => {
      setPhase("reconnecting");
      setWsRetryCount(count);
    });

    client.onFailed(() => {
      setPhase("error");
      setError("Signaling connection failed — max retries exceeded");
    });

    client.connect();
    clientRef.current = client;

    return () => {
      client.destroy();
      clientRef.current = null;
    };
  }, [postToWorker, setPhase, setRoomCode, setWsRetryCount, setError]);

  function createRoom(): void {
    setPhase("creating");
    clientRef.current?.send({ type: "create" });
  }

  function joinRoom(code: string): void {
    setPhase("joining");
    clientRef.current?.setRoomCode(code);
    clientRef.current?.send({ type: "join", code });
  }

  function sendSignal(data: Record<string, unknown>): void {
    clientRef.current?.send({ type: "signal", data });
  }

  function sendReady(): void {
    clientRef.current?.send({ type: "ready" });
  }

  return { createRoom, joinRoom, sendSignal, sendReady };
}
