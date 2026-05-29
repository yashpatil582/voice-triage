/**
 * Belt-and-suspenders safety check.
 *
 * The LLM is the primary signal — its `safety_flags` field on each Turn
 * is the source of truth for the UI. This module is a secondary keyword
 * scan, layered on top so red flags can't slip past a hallucinated
 * `safety_flags: []` from the model.
 *
 * Pattern: deterministic regex check on the raw user transcript. If a
 * red-flag pattern matches and the LLM didn't surface it, the UI escalates
 * regardless. Better one false positive (telling someone to call 911 who
 * doesn't need to) than one false negative.
 */

export type RedFlag =
  | "chest_pain"
  | "severe_headache"
  | "dyspnea"
  | "neuro_deficit"
  | "mental_health_emergency"
  | "acute_abdomen"
  | "anaphylaxis";

export const ALLOWED_FLAGS: ReadonlySet<RedFlag> = new Set<RedFlag>([
  "chest_pain",
  "severe_headache",
  "dyspnea",
  "neuro_deficit",
  "mental_health_emergency",
  "acute_abdomen",
  "anaphylaxis",
]);

const RED_FLAG_PATTERNS: { flag: RedFlag; patterns: RegExp[] }[] = [
  {
    flag: "chest_pain",
    patterns: [
      /\b(crushing|squeez(ing|e)|pressure|tight(ness)?)\b.{0,40}\bchest\b/i,
      /\bchest\b.{0,40}\b(crushing|squeez(ing|e)|pressure)\b/i,
      /\bchest pain\b.{0,40}\bradiat(ing|es)\b.{0,40}\b(arm|jaw|neck)\b/i,
      /\bradiat(ing|es) to .{0,20}\b(arm|jaw|neck)\b/i,
      /\bheart attack\b/i,
    ],
  },
  {
    flag: "severe_headache",
    patterns: [
      /\bworst\b.{0,20}\b(headache|head ache|migraine)\b/i,
      /\bthunderclap\b/i,
      /\bsudden(ly)?\b.{0,30}\b(severe|terrible|worst)\b.{0,20}\bhead/i,
    ],
  },
  {
    flag: "dyspnea",
    patterns: [
      /\bcan'?t breathe\b/i,
      /\bcannot breathe\b/i,
      /\b(blue|cyanot(ic|ed))\b.{0,15}\b(lips|fingers)\b/i,
      /\b(lips|fingers)\b.{0,20}\b(turning blue|blue|cyanot)/i,
      /\bcan'?t finish (a )?sentence/i,
    ],
  },
  {
    flag: "neuro_deficit",
    patterns: [
      /\bfacial droop\b/i,
      /\bface\b.{0,15}\bdroop(ing)?\b/i,
      /\bone[- ]sided\b.{0,20}\b(weak|paral)/i,
      /\b(right|left)\b.{0,15}\bside\b.{0,15}\bweak/i,
      /\bslurred speech\b/i,
      /\bspeech\b.{0,15}\bslurr/i,
      /\b(sudden|abrupt) (vision|sight) loss\b/i,
      /\bstroke\b/i,
    ],
  },
  {
    flag: "mental_health_emergency",
    patterns: [
      /\b(kill|harm|hurt) (myself|me)\b/i,
      /\bsuicid(e|al|ality)\b/i,
      /\bend (my )?life\b/i,
      /\b(don'?t want to|want to stop) (live|living|be alive)\b/i,
    ],
  },
  {
    flag: "acute_abdomen",
    patterns: [
      /\bvomit(ing)? blood\b/i,
      /\bblood in (my )?vomit\b/i,
      /\babdom(en|inal)\b.{0,30}\brigid/i,
      /\b(rigid|hard as a board)\b.{0,20}\babdom/i,
    ],
  },
  {
    flag: "anaphylaxis",
    patterns: [
      /\bthroat\b.{0,20}\b(closing|swelling|swell|swoll|tight)/i,
      /\btongue\b.{0,15}\b(swell|swoll)/i,
      /\banaphylaxis\b/i,
      /\b(hives|rash|swelling|swollen)\b.{0,30}\b(breath|swallow|throat)/i,
      /\b(breath|swallow|throat)\b.{0,30}\b(hives|rash|swelling|swollen)\b/i,
    ],
  },
];

export function scanForRedFlags(text: string): RedFlag[] {
  const found = new Set<RedFlag>();
  for (const { flag, patterns } of RED_FLAG_PATTERNS) {
    if (patterns.some((p) => p.test(text))) {
      found.add(flag);
    }
  }
  return Array.from(found);
}

/**
 * Combine the LLM's reported flags with the deterministic keyword scan.
 * Returns the union; if the union is non-empty, the caller should escalate.
 */
export function mergeFlags(llmFlags: string[], userText: string): string[] {
  const scanned = scanForRedFlags(userText);
  const validLlmFlags = llmFlags.filter((f): f is RedFlag =>
    ALLOWED_FLAGS.has(f as RedFlag),
  );
  return Array.from(new Set<string>([...validLlmFlags, ...scanned]));
}

/** Should the UI surface an "ER now" banner? */
export function shouldEscalate(flags: string[]): boolean {
  return flags.length > 0;
}
