// Colours and short codes for the Earth Analogs atlas.
// Grade colours are ordinal (A strong to F weak) and come from GRADE_HEX. Environment and study-theme colours are
// categorical and deliberately different hues; every badge also carries text so colour is never the only cue.
import { GRADE_HEX } from "./format";
import type { Grade, Pin } from "./types";
import type { ColorBy } from "@/store";

export interface Category { id: string; label: string; code: string; color: string; ink: string }

export const ENVIRONMENTS: Category[] = [
  { id: "desert", label: "Arid desert", code: "Ar", color: "#cdb38c", ink: "#1b1610" },
  { id: "volcanic", label: "Volcanic or basaltic", code: "Vo", color: "#9277b0", ink: "#fff" },
  { id: "polar", label: "Polar, ice or permafrost", code: "Po", color: "#e9f2f8", ink: "#13202b" },
  { id: "impact", label: "Impact structure", code: "Im", color: "#8f99a6", ink: "#0e1116" },
  { id: "salt", label: "Salt flat or brine", code: "Sa", color: "#dcb7d4", ink: "#23121f" },
  { id: "subsurface", label: "Cave or lava tube", code: "Cv", color: "#56677a", ink: "#fff" },
  { id: "hydrothermal", label: "Hydrothermal or spring", code: "Hy", color: "#c46f7f", ink: "#fff" },
  { id: "other", label: "Other or mixed", code: "?", color: "#3b4350", ink: "#e9eef3" },
];
export const APPLICATIONS: Category[] = [
  { id: "mobility", label: "Operations and mobility", code: "Mo", color: "#a7bccf", ink: "#101820" },
  { id: "geology", label: "Geology and sampling", code: "Ge", color: "#b98d6b", ink: "#170f09" },
  { id: "ice", label: "Ice and drilling", code: "Ic", color: "#e3eef5", ink: "#13202b" },
  { id: "dust", label: "Dust and aeolian", code: "Du", color: "#d2bd84", ink: "#1a150a" },
  { id: "astrobiology", label: "Habitability and biosignatures", code: "Bi", color: "#93b07c", ink: "#0f170b" },
  { id: "isru", label: "Resource use (ISRU)", code: "Is", color: "#a592c6", ink: "#fff" },
  { id: "other", label: "Other or mixed", code: "?", color: "#3b4350", ink: "#e9eef3" },
];

export const categoriesFor = (by: ColorBy) => (by === "application" ? APPLICATIONS : ENVIRONMENTS);
export const primaryCategory = (pin: Pin, by: ColorBy): Category => {
  const list = categoriesFor(by);
  const tags = by === "application" ? pin.tags?.applications : pin.tags?.environment;
  return list.find((c) => c.id === tags?.[0]?.id) ?? list[list.length - 1];
};
export const pinCategories = (pin: Pin, by: ColorBy): string[] =>
  ((by === "application" ? pin.tags?.applications : pin.tags?.environment) ?? [{ id: "other" }]).map((t) => t.id);

export interface Badge { text: string; color: string; ink: string; title: string }
export function badgeFor(pin: Pin, by: ColorBy, grade: Grade | null | undefined, context: string): Badge {
  const status = pin.verification_status === "review_needed" ? "research candidate; evidence review needed" : "documented analog site";
  // A model may compare any selected cell, but a research candidate is never labeled documented.
  if (by === "grade") {
    return grade
      ? { text: grade, color: GRADE_HEX[grade], ink: "#101216", title: `${pin.name}: ${status}; calculated analog similarity grade ${grade} for ${context}` }
      : { text: "•", color: "#415166", ink: "#e9eef3", title: `${pin.name}: ${status}; not yet scored or insufficient comparable data` };
  }
  const c = primaryCategory(pin, by);
  const all = (by === "application" ? pin.tags?.applications : pin.tags?.environment)?.map((t) => t.label).join(", ") ?? c.label;
  return { text: c.code, color: c.color, ink: c.ink, title: `${pin.name}: ${by === "application" ? "studied for" : "environment"}: ${all}` };
}
