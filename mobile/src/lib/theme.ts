/** WhatsApp-inspired palette and spacing. */
export const colors = {
  primary: '#008069',
  primaryDark: '#075E54',
  accent: '#25D366',
  bubbleMine: '#D9FDD3',
  bubbleOther: '#FFFFFF',
  chatBg: '#EFEAE2',
  bg: '#FFFFFF',
  surface: '#F7F8FA',
  border: '#E3E6EA',
  text: '#111B21',
  muted: '#667781',
  danger: '#E53935',
  callBg: '#0B141A',
  white: '#FFFFFF',
} as const;

export const roleColors: Record<string, string> = {
  buyer: '#1E88E5',
  seller: '#008069',
  broker: '#8E24AA',
};

export const radius = { sm: 8, md: 12, lg: 20, pill: 999 } as const;
