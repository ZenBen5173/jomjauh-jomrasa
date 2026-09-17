import raw from "../../public/data/jomrasa.json";

export interface JrState {
  code: string; mentions_n: number; experience_raw: number | null; experience_score: number;
  experience_lo: number; experience_hi: number; share_positive: number | null; share_negative: number | null;
  access_sentiment: number; amenity_sentiment: number; prior_k: number; national_mean: number;
  [k: string]: number | string | null;
}
export interface JrTopic { code: string; topic: string; n: number; sentiment_raw: number | null; sentiment: number; share_of_mentions: number }
export interface JrQuote { code: string; text: string; url: string; source_type: string; language: string; overall: number; emotion: string; place: string | null; topics: string[] }
export interface JrPlace {
  code: string; place: string; mentions: number; sentiment: number; tags: string[]; praised_for: string[]; emotions: string[];
  quote: string; quote_url: string; lat: number; lon: number;
}
export interface JrMeta {
  topics: string[]; emotions: string[]; model: string; items_collected: number; items_tagged: number; items_travel: number;
  by_source: Record<string, number>; validation: Record<string, number> | null;
}

const J = raw as unknown as { ready: boolean; states: JrState[]; topics: JrTopic[]; quotes: JrQuote[]; places: JrPlace[]; meta: JrMeta };
export const JR = J;

export const TOPIC_LABEL: Record<string, string> = {
  access_transport: "Access & transport", accommodation: "Accommodation", food: "Food", price_value: "Price & value",
  crowding: "Crowding", cleanliness: "Cleanliness", scenery_nature: "Scenery & nature", culture_heritage: "Culture & heritage",
  safety: "Safety", activities: "Activities", hospitality_service: "Hospitality & service",
};

/** Emotions are identities, so they get fixed categorical slots (validated dark palette + neutral grey). */
export const EMOTION_COLOR: Record<string, string> = {
  joy: "#c98500", calm: "#199e70", surprise: "#9085e9", trust: "#3987e5",
  disappointment: "#d55181", frustration: "#e66767", fear: "#d95926", neutral: "#5a6169",
};
