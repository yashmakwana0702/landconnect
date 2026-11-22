/** Mirrors backend/app/schemas.py. */
export type Role = 'buyer' | 'seller' | 'broker';

export interface PublicUser {
  id: string;
  display_name: string;
  role: Role;
}

export interface Me extends PublicUser {
  email: string;
  phone: string | null;
  calls_enabled: boolean;
}

export interface TokenOut {
  access_token: string;
  user: Me;
}

export interface ListingInput {
  title: string;
  description: string;
  price_inr: number;
  area_acres: number;
  locality: string;
  latitude: number;
  longitude: number;
  hide_exact_location: boolean;
}

export interface Listing extends ListingInput {
  id: string;
  owner: PublicUser;
  status: 'active' | 'sold';
  images: { id: string; url: string }[];
  is_mine: boolean;
  location_is_approximate: boolean;
  created_at: string;
  updated_at: string;
}

export type MessageKind = 'text' | 'call' | 'meeting';

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  kind: MessageKind;
  body: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  title: string | null;
  is_group: boolean;
  listing: { id: string; title: string } | null;
  members: PublicUser[];
  last_message: Message | null;
  last_message_at: string;
}

export type CallKind = 'audio' | 'video';
export type CallStatus = 'ringing' | 'active' | 'rejected' | 'missed' | 'cancelled' | 'ended';

export interface Call {
  id: string;
  conversation_id: string;
  kind: CallKind;
  status: CallStatus;
  caller: PublicUser;
  callee: PublicUser;
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
}

export interface LiveKitCredentials {
  url: string;
  token: string;
  room: string;
}

export interface CallSession {
  call: Call;
  livekit: LiveKitCredentials | null;
}

export interface BuyerRequirements {
  budget_min_inr: number | null;
  budget_max_inr: number | null;
  area_min_acres: number | null;
  area_max_acres: number | null;
  locations: string[];
  must_haves: string[];
}

export interface MatchResponse {
  requirements: BuyerRequirements;
  parsed_by: 'llm' | 'rules';
  results: { listing: Listing; score: number; reasons: string[] }[];
}

/** Server -> client WebSocket events. */
export type RealtimeEvent =
  | { type: 'message.new'; data: Message }
  | { type: 'call.incoming' | 'call.accepted' | 'call.rejected' | 'call.cancelled' | 'call.missed' | 'call.ended'; data: Call };
