/**
 * Persona-based behavioral eval for voice-triage.
 *
 * For each persona in `eval/personas/*.json`, replay the utterances through
 * the agent loop (no network — direct LLM client calls). Score:
 *  - `disposition_match`: did the final triage_disposition match expected_outcome?
 *  - `safety_flag_match`: was each expected red flag raised within bounds?
 *  - `escalation_timing`: for must_escalate personas, did we end_conversation
 *    on or before `must_escalate_by_turn`?
 *  - `no_false_alarm`: for must_not_escalate personas, did we avoid raising flags?
 *
 * A persona PASSES if every applicable scoring rule is satisfied.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { llmClient, llmModel } from "../lib/groq.ts";
import { TurnSchema, TURN_SYSTEM_PROMPT, type Turn } from "../lib/prompts.ts";
import { mergeFlags } from "../lib/safety.ts";

type Persona = {
  id: string;
  presenting_complaint: string;
  utterances: string[];
  expected_outcome: "self_care" | "pcp_followup" | "urgent_care" | "er_referral";
  expected_safety_flags: string[];
  must_not_escalate?: boolean;
  must_escalate_by_turn?: number;
};

type PersonaResult = {
  id: string;
  passed: boolean;
  final_disposition: string;
  expected_disposition: string;
  observed_flags: string[];
  expected_flags: string[];
  ended_at_turn: number | null;
  turn_count: number;
  history: { role: "user" | "assistant"; content: string }[];
  failures: string[];
};

async function playPersona(persona: Persona): Promise<PersonaResult> {
  const client = llmClient();
  const model = llmModel();
  const history: { role: "user" | "assistant"; content: string }[] = [];
  const observedFlags = new Set<string>();
  let finalDisposition: Turn["triage_disposition"] = "unknown";
  let endedAtTurn: number | null = null;
  let turn = 0;

  for (const utterance of persona.utterances) {
    turn += 1;
    const response = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: TURN_SYSTEM_PROMPT },
        ...history,
        { role: "user", content: utterance },
      ],
    });
    const raw = response.choices[0]?.message?.content ?? "{}";
    let parsed: Turn;
    try {
      parsed = TurnSchema.parse(JSON.parse(raw));
    } catch {
      parsed = {
        reply: "(malformed response)",
        safety_flags: [],
        triage_disposition: "unknown",
        end_conversation: false,
      };
    }

    const merged = mergeFlags(parsed.safety_flags, utterance);
    merged.forEach((f) => observedFlags.add(f));
    finalDisposition =
      merged.length > 0 ? "er_referral" : parsed.triage_disposition;

    history.push({ role: "user", content: utterance });
    history.push({ role: "assistant", content: parsed.reply });

    if (parsed.end_conversation || merged.length > 0) {
      endedAtTurn = turn;
      break;
    }
  }

  // Scoring
  const failures: string[] = [];
  const observedFlagArr = Array.from(observedFlags);

  if (finalDisposition !== persona.expected_outcome) {
    failures.push(
      `disposition mismatch: got ${finalDisposition}, expected ${persona.expected_outcome}`,
    );
  }
  for (const flag of persona.expected_safety_flags) {
    if (!observedFlags.has(flag)) failures.push(`missing expected flag: ${flag}`);
  }
  if (persona.must_not_escalate && observedFlagArr.length > 0) {
    failures.push(`false alarm: ${observedFlagArr.join(", ")}`);
  }
  if (persona.must_escalate_by_turn != null) {
    if (endedAtTurn == null) {
      failures.push(`failed to escalate within ${persona.must_escalate_by_turn} turns`);
    } else if (endedAtTurn > persona.must_escalate_by_turn) {
      failures.push(
        `escalated too late: ended at turn ${endedAtTurn}, expected by ${persona.must_escalate_by_turn}`,
      );
    }
  }

  return {
    id: persona.id,
    passed: failures.length === 0,
    final_disposition: finalDisposition,
    expected_disposition: persona.expected_outcome,
    observed_flags: observedFlagArr,
    expected_flags: persona.expected_safety_flags,
    ended_at_turn: endedAtTurn,
    turn_count: turn,
    history,
    failures,
  };
}

async function main(): Promise<void> {
  const here = new URL(".", import.meta.url).pathname;
  const personasDir = join(here, "personas");
  const resultsDir = join(here, "results");
  mkdirSync(resultsDir, { recursive: true });

  const files = readdirSync(personasDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  console.log(`\nRunning ${files.length} personas through ${llmModel()}\n`);

  const results: PersonaResult[] = [];
  for (const file of files) {
    const persona: Persona = JSON.parse(readFileSync(join(personasDir, file), "utf-8"));
    process.stdout.write(`  ${persona.id.padEnd(30)} `);
    try {
      const r = await playPersona(persona);
      results.push(r);
      const marker = r.passed ? "✓" : "✗";
      console.log(`${marker}  disp=${r.final_disposition}  flags=[${r.observed_flags.join(",")}]`);
      if (!r.passed) {
        for (const f of r.failures) console.log(`       └─ ${f}`);
      }
    } catch (e) {
      console.log(`  ERROR: ${e instanceof Error ? e.message : "unknown"}`);
      results.push({
        id: persona.id,
        passed: false,
        final_disposition: "error",
        expected_disposition: persona.expected_outcome,
        observed_flags: [],
        expected_flags: persona.expected_safety_flags,
        ended_at_turn: null,
        turn_count: 0,
        history: [],
        failures: [e instanceof Error ? e.message : "unknown"],
      });
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const aggregate = {
    n: total,
    passed,
    pass_rate: total === 0 ? 0 : passed / total,
  };

  console.log(`\nAggregate: ${passed} / ${total} passed (${(aggregate.pass_rate * 100).toFixed(1)}%)\n`);
  writeFileSync(
    join(resultsDir, "personas.json"),
    JSON.stringify({ aggregate, results }, null, 2),
  );
  console.log(`Wrote ${join(resultsDir, "personas.json")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
