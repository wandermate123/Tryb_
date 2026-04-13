/**
 * Tryb Studios ICP — three niches only (D2C product + boutique hospitality).
 * Apollo: mixed_people search uses q_organization_keyword_tags per niche batch.
 */
export type NicheDefinition = {
  key: string;
  /** Stored on OutboundLead.nicheSegment */
  label: string;
  /** Target result size for this Apollo call (before cross-niche dedupe). */
  perPage: number;
  keywordTags: string[];
};

/** Order preserves SOP daily mix intent: ~30 beauty, ~30 F&B, ~15 hospitality (fetch caps). */
export const NICHE_SEARCH_ORDER: readonly NicheDefinition[] = [
  {
    key: "beauty",
    label: "Skincare & Beauty",
    perPage: 30,
    keywordTags: [
      "skincare",
      "cosmetics",
      "beauty",
      "personal care",
      "sunscreen",
      "hair care",
      "beard care",
    ],
  },
  {
    key: "food",
    label: "Food & Beverage",
    perPage: 30,
    keywordTags: [
      "food and beverage",
      "supplements",
      "coffee",
      "plant based",
      "kombucha",
      "chocolate",
      "health drinks",
      "protein",
    ],
  },
  {
    key: "hospitality",
    label: "Boutique Hospitality",
    perPage: 15,
    keywordTags: ["boutique hotel", "resort", "hospitality", "eco resort", "glamping", "luxury hotel"],
  },
] as const;
