import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { WS_URL } from './api';
import type { RealtimeEvent } from './types';

type Listener = (event: RealtimeEvent) => void;
type Status = 'offline' | 'connecting' | 'online';

const listeners = new Set<Listener>();
let status: Status = 'offline';
const statusListeners = new Set<() => void>();

const PING_MS = 25_000;
const MAX_BACKOFF_MS = 15_000;

function setStatus(next: Status): void {
  status = next;
  statusListeners.forEach((fn) => fn());
}

/** Subscribe to server events for the lifetime of a component. */
export function useRealtime(handler: Listener): void {
  const ref = useRef(handler);
  useLayoutEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const fn: Listener = (e) => ref.current(e);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
}

export function useRealtimeStatus(): Status {
  return useSyncExternalStore(
    (cb) => {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
    () => status,
  );
}

/**
 * Keeps one authenticated WebSocket open while signed in: reconnects with
 * backoff, pings to keep NATs open, and reconnects when the app returns to
 * the foreground.
 */
export function RealtimeProvider({ token, children }: { token: string | null; children: ReactNode }) {
  useEffect(() => {
    if (!token) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;

    const connect = () => {
      if (closed || (ws && ws.readyState <= WebSocket.OPEN)) return;
      setStatus('connecting');
      ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
      ws.onopen = () => {
        attempt = 0;
        setStatus('online');
        ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send('ping'), PING_MS);
      };
      ws.onmessage = (msg) => {
        if (msg.data === 'pong') return;
        try {
          const event = JSON.parse(String(msg.data)) as RealtimeEvent;
          listeners.forEach((fn) => fn(event));
        } catch {
          // ignore malformed frames
        }
      };
      ws.onclose = () => {
        clearInterval(ping);
        ws = null;
        setStatus('offline');
        if (closed) return;
        attempt += 1;
        retry = setTimeout(connect, Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS));
      };
      ws.onerror = () => ws?.close();
    };

    connect();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        clearTimeout(retry);
        connect();
      }
    });
    return () => {
      closed = true;
      sub.remove();
      clearTimeout(retry);
      clearInterval(ping);
      ws?.close();
      setStatus('offline');
    };
  }, [token]);

  return <>{children}</>;
}
