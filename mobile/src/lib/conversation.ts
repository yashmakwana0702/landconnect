import type { Conversation, PublicUser } from './types';

/** The other person in a 1:1 chat (undefined for groups). */
export function otherMember(conv: Conversation, meId: string): PublicUser | undefined {
  return conv.is_group ? undefined : conv.members.find((m) => m.id !== meId);
}

export function conversationTitle(conv: Conversation, meId: string): string {
  if (conv.is_group) return conv.title || conv.members.filter((m) => m.id !== meId).map((m) => m.display_name).join(', ');
  return otherMember(conv, meId)?.display_name ?? 'Chat';
}
