// TODO(clinical-review): verify wording and citations before release.
/**
 * THE config file for the hologram's interactive body systems: hotspot and
 * label coordinates are all percent-based ({x, y} of the image box) so they
 * scale with the image and can be nudged freely once the PNG is placed.
 *
 * `hotspot` = the glowing dot on the body. `label` = the anchored pill's
 * corner; `side` decides which direction the pill extends and where the
 * leader line attaches. `leader` is the SVG endpoint of the connecting line.
 *
 * Citations are keys into CITATIONS (content/riskOverview.ts) — or null, in
 * which case no citation line renders. Nothing here was invented: signs come
 * from the design mockup; no citation key exists yet because the mockup did
 * not show one for the body systems.
 */

export type LabelSide = "left" | "right";

export interface BodySystem {
  id: string;
  /** Pill display name ("Respiratory"). */
  name: string;
  /** Material Symbols ligature name (verified against the loaded variable font). */
  iconName: string;
  /** Percent position of the glowing hotspot button. */
  hotspot: { x: number; y: number };
  /** Percent position of the label pill's anchor corner. */
  label: { x: number; y: number; side: LabelSide };
  /** Percent endpoint of the leader line (usually midway). */
  leader: { x: number; y: number };
  signs: string[];
  /** "Why it matters" one-liner (TODO(clinical-review)). */
  whyItMatters: string;
  citationKey: string | null;
}

export const BODY_SYSTEMS: readonly BodySystem[] = [
  {
    id: "neurological",
    name: "Neurological",
    iconName: "neurology",
    hotspot: { x: 50, y: 15 },
    label: { x: 4, y: 10, side: "left" },
    leader: { x: 34, y: 14 },
    signs: ["Lethargy", "Irritability", "Seizures"],
    whyItMatters:
      "Early behavior changes are often the first nonspecific sign of neonatal sepsis.",
    citationKey: null,
  },
  {
    id: "respiratory",
    name: "Respiratory",
    iconName: "pulmonology",
    hotspot: { x: 46, y: 34 },
    label: { x: 96, y: 22, side: "right" },
    leader: { x: 78, y: 30 },
    signs: ["Tachypnea", "Apnea", "Oxygen requirement"],
    whyItMatters:
      "Respiratory distress is the most frequent presenting sign of early-onset sepsis.",
    citationKey: null,
  },
  {
    id: "cardiovascular",
    name: "Cardiovascular",
    iconName: "ecg_heart",
    hotspot: { x: 44, y: 43 },
    label: { x: 4, y: 58, side: "left" },
    leader: { x: 38, y: 44 },
    signs: ["Tachycardia", "Hypotension"],
    whyItMatters:
      "Circulatory compromise can progress quickly and needs immediate review.",
    citationKey: null,
  },
  {
    id: "gastrointestinal",
    name: "Gastrointestinal",
    iconName: "gastroenterology",
    hotspot: { x: 52, y: 57 },
    label: { x: 96, y: 50, side: "right" },
    leader: { x: 70, y: 55 },
    signs: ["Feeding intolerance", "Vomiting"],
    whyItMatters:
      "Feeding changes are common in early infection and easy to miss between feeds.",
    citationKey: null,
  },
];

export type BodySystemId = (typeof BODY_SYSTEMS)[number]["id"];
