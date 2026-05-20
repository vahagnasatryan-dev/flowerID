export type Reaction = "dislike" | "like" | "love" | "hard_no";
export type FlowerReaction = "love" | "neutral" | "dislike" | "forbidden";
export type ArchetypeId =
  | "garden_romance"
  | "white_green_minimalism"
  | "dramatic_elegance"
  | "sunny_joy"
  | "wild_garden"
  | "art_experiment"
  | "quiet_luxury"
  | "classic_femininity"
  | "paris_morning"
  | "evening_wow";

export interface BouquetCard {
  id: string;
  title: string;
  tags: string[];
  palette: string[];
  style: string;
  boldness: number;
  form: string;
  gradient: string;
  accent: string;
}

export interface Option {
  id: string;
  label: string;
  description?: string;
  colors?: string[];
}

export interface UserContact {
  name: string;
  phone: string;
  telegram: string;
}

export interface Answers {
  bouquet_swipes: Array<{ card_id: string; reaction: Reaction }>;
  mood: string[];
  favorite_palettes: string[];
  ideal_palette: string;
  rejected_palettes: string[];
  flowers: Record<string, FlowerReaction>;
  size: string;
  wow_vs_practical: number;
  fragrance: string;
  longevity: string;
  home_conditions: string[];
  allergies: {
    has_allergy: boolean;
    kind: string;
    comment: string;
  };
  packaging: string[];
  packaging_stoplist: string[];
  associations: string[];
  personal_note: string;
  user: UserContact;
}

export interface ComputedProfile {
  primary_archetype: ArchetypeId;
  secondary_archetype: ArchetypeId | null;
  title: string;
  description: string;
  preferred_colors: string[];
  avoid_colors: string[];
  favorite_flowers: string[];
  avoid_flowers: string[];
  format: string;
  emotion: string[];
  florist_brief: string;
  share_text: string;
}

export interface QuizEvent {
  id: string;
  session_id: string;
  event_name: string;
  event_payload: Record<string, unknown>;
  created_at: string;
}

export type CollectorRecordKind = "event" | "submission" | "request" | "feedback" | "order";

export interface CollectorRecord {
  id: string;
  kind: CollectorRecordKind;
  session_id: string;
  created_at: string;
  payload: Record<string, unknown>;
}

export interface FlowerSubmission {
  id: string;
  created_at: string;
  updated_at?: string;
  answers: Answers;
  computed_profile: ComputedProfile;
  source?: string | null;
  referrer_id?: string | null;
  request_id?: string | null;
}

export interface FlowerRequest {
  id: string;
  requesterName: string;
  recipientName: string;
  occasion: string;
  comment: string;
  status: "created" | "opened" | "started_quiz" | "completed";
  submissionId?: string;
  created_at: string;
  opened_at?: string;
  started_at?: string;
  completed_at?: string;
}

export interface ResultFeedbackRecord {
  id: string;
  submissionId: string;
  archetype: ArchetypeId;
  view: string;
  phase: "clicked" | "submitted";
  value: string;
  comment: string;
  created_at: string;
}

export interface FlowerOrder {
  id: string;
  submissionId: string;
  requestId?: string | null;
  archetype: ArchetypeId | string;
  recipientName: string;
  flowerId: string;
  budget: string;
  occasion: string;
  deliveryDate: string;
  deliveryDetails: string;
  senderName: string;
  senderContact: string;
  comment: string;
  source: "result" | "request_status" | "public_profile";
  status: "created";
  message: string;
  created_at: string;
}
