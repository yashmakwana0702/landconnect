import { useSyncExternalStore } from 'react';

import { api } from './api';
import type { Call, CallKind, CallSession } from './types';

/**
 * Global call state shared by the incoming-call and in-call screens.
 * `session` is the call this device is part of; `incoming` is a call ringing here.
 */
interface CallState {
  session: CallSession | null;
  incoming: Call | null;
}

let state: CallState = { session: null, incoming: null };
const subs = new Set<() => void>();

function set(patch: Partial<CallState>): void {
  state = { ...state, ...patch };
  subs.forEach((fn) => fn());
}

export function useCallState(): CallState {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => state,
  );
}

export const callStore = {
  get: (): CallState => state,

  setIncoming(call: Call | null): void {
    set({ incoming: call });
  },

  /** Apply a server-side status change to whichever call it belongs to. */
  applyUpdate(call: Call): void {
    if (state.session?.call.id === call.id) set({ session: { ...state.session, call } });
    if (state.incoming?.id === call.id) set({ incoming: call.status === 'ringing' ? call : null });
  },

  clearSession(): void {
    set({ session: null });
  },

  async start(conversationId: string, kind: CallKind): Promise<CallSession> {
    const session = await api.post<CallSession>('/calls', { conversation_id: conversationId, kind });
    set({ session });
    return session;
  },

  async accept(callId: string): Promise<CallSession> {
    const session = await api.post<CallSession>(`/calls/${callId}/accept`);
    set({ session, incoming: null });
    return session;
  },

  async reject(callId: string): Promise<void> {
    set({ incoming: null });
    await api.post<Call>(`/calls/${callId}/reject`);
  },

  async end(callId: string): Promise<void> {
    const call = await api.post<Call>(`/calls/${callId}/end`).catch(() => null);
    if (call) this.applyUpdate(call);
  },
};
