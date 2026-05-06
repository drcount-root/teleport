import {
  WS_RETRY_BASE_MS,
  WS_RETRY_MAX_ATTEMPTS,
  WS_RETRY_MULTIPLIER,
} from "@repo/shared";
import type { SignalMessage } from "@repo/shared";

type SignalingListener = (msg: SignalMessage) => void;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<SignalingListener>();
  private onFailedCallback: (() => void) | null = null;
  private onRetryCallback: ((count: number) => void) | null = null;
  private roomCode: string | null = null;
  private readonly url: string;
  private destroyed = false;

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    if (this.destroyed) return;
    this.ws = new WebSocket(this.url);
    this.ws.onopen = this.handleOpen;
    this.ws.onmessage = this.handleMessage;
    this.ws.onclose = this.handleClose;
    this.ws.onerror = this.handleError;
  }

  private handleOpen = (): void => {
    this.retryCount = 0;
    if (this.roomCode) {
      this.send({ type: "rejoin", code: this.roomCode });
    }
  };

  private handleMessage = (ev: MessageEvent<string>): void => {
    try {
      const msg = JSON.parse(ev.data) as SignalMessage;
      this.listeners.forEach((fn) => fn(msg));
    } catch {
      // Ignore malformed frames
    }
  };

  private handleClose = (): void => {
    if (this.destroyed) return;
    this.scheduleRetry();
  };

  private handleError = (): void => {
    // WS fires error before close — handleClose drives retry
    this.ws?.close();
  };

  private scheduleRetry(): void {
    if (this.retryCount >= WS_RETRY_MAX_ATTEMPTS) {
      this.onFailedCallback?.();
      return;
    }
    const delay =
      WS_RETRY_BASE_MS * Math.pow(WS_RETRY_MULTIPLIER, this.retryCount);
    this.retryCount++;
    this.onRetryCallback?.(this.retryCount);
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  send(msg: SignalMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  setRoomCode(code: string | null): void {
    this.roomCode = code;
  }

  onMessage(fn: SignalingListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onFailed(fn: () => void): void {
    this.onFailedCallback = fn;
  }

  onRetry(fn: (count: number) => void): void {
    this.onRetryCallback = fn;
  }

  destroy(): void {
    this.destroyed = true;
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.listeners.clear();
  }
}
