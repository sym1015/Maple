export const DESIGNER_CATEGORIES = [
  "body",
  "face",
  "hair",
  "hat",
  "face-accessory",
  "eye-accessory",
  "earrings",
  "top",
  "bottom",
  "overall",
  "shoes",
  "gloves",
  "cape",
  "weapon",
  "shield",
  "ring",
  "medal",
  "pendant",
  "etc",
] as const;

export type DesignerCategory = (typeof DESIGNER_CATEGORIES)[number];

/** typeInfo as returned by GET /item (verified against gms/270). */
export interface ApiTypeInfo {
  overallCategory: string;
  category: string;
  subCategory: string;
  lowItemId?: number;
  highItemId?: number;
}

/** One entry of GET /item or GET /item/category/{category} (verified against gms/270). */
export interface ApiItemSummary {
  id: number;
  name: string;
  desc?: string;
  isCash?: boolean;
  requiredGender?: number;
  requiredJobs?: string[];
  requiredLevel?: number;
  typeInfo?: ApiTypeInfo;
}

/** Normalized item used by the frontend. The item id is the canonical identifier. */
export interface MapleItem {
  id: number;
  name: string;
  category: DesignerCategory;
  /** Original API subCategory, kept for debugging and finer filters. */
  subCategory?: string;
  /** Path of the downloaded icon, relative to the site root. */
  icon?: string;
  iconRaw?: string;
  description?: string;
  isCash?: boolean;
  requiredGender?: number;
  raw?: unknown;
}
