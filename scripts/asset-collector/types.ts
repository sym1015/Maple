export { DESIGNER_CATEGORIES, type DesignerCategory, type MapleItem } from "../../src/types/item";

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
