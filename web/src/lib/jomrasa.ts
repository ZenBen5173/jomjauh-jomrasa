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

/** One hue: good feelings are steps of blue, bad ones steps of grey. */
export const EMOTION_COLOR: Record<string, string> = {
  joy: "#3987e5", calm: "#86b6ef", surprise: "#b7d3f6", trust: "#24508a",
  disappointment: "#9a9da6", frustration: "#6e727b", fear: "#c4c7ce", neutral: "#4a4d55",
};
