import { describe, test, expect } from "vitest";
import { scanForRedFlags, mergeFlags, shouldEscalate } from "../lib/safety";

describe("scanForRedFlags", () => {
  test("chest pain crushing/pressure triggers chest_pain flag", () => {
    expect(scanForRedFlags("I have crushing chest pain")).toEqual(["chest_pain"]);
    expect(scanForRedFlags("The pressure in my chest is awful")).toEqual(["chest_pain"]);
    expect(scanForRedFlags("chest pain radiating to my left arm")).toEqual(["chest_pain"]);
  });

  test("'worst headache' triggers severe_headache flag", () => {
    expect(scanForRedFlags("worst headache of my life")).toEqual(["severe_headache"]);
    expect(scanForRedFlags("thunderclap headache")).toEqual(["severe_headache"]);
  });

  test("breathing emergencies trigger dyspnea flag", () => {
    expect(scanForRedFlags("I can't breathe")).toEqual(["dyspnea"]);
    expect(scanForRedFlags("my lips are turning blue")).toEqual(["dyspnea"]);
    expect(scanForRedFlags("can't finish a sentence")).toEqual(["dyspnea"]);
  });

  test("stroke symptoms trigger neuro_deficit flag", () => {
    expect(scanForRedFlags("facial droop and slurred speech")).toEqual(["neuro_deficit"]);
    expect(scanForRedFlags("one-sided weakness")).toEqual(["neuro_deficit"]);
    expect(scanForRedFlags("sudden vision loss")).toEqual(["neuro_deficit"]);
    // Word-order variants that exposed regex bugs in real persona transcripts
    expect(scanForRedFlags("my face is drooping on one side")).toEqual(["neuro_deficit"]);
    expect(scanForRedFlags("my speech is slurred")).toEqual(["neuro_deficit"]);
    expect(scanForRedFlags("my right side feels weak")).toEqual(["neuro_deficit"]);
  });

  test("self-harm language triggers mental_health_emergency", () => {
    expect(scanForRedFlags("I want to kill myself")).toEqual(["mental_health_emergency"]);
    expect(scanForRedFlags("suicidal thoughts")).toEqual(["mental_health_emergency"]);
  });

  test("anaphylaxis word-order variants trigger anaphylaxis flag", () => {
    expect(scanForRedFlags("my throat is closing")).toEqual(["anaphylaxis"]);
    expect(scanForRedFlags("tongue feels swollen")).toEqual(["anaphylaxis"]);
    expect(scanForRedFlags("hives and trouble breathing")).toEqual(["anaphylaxis"]);
  });

  test("benign symptoms do NOT trigger any flag", () => {
    expect(scanForRedFlags("I have a sore throat for three days")).toEqual([]);
    expect(scanForRedFlags("My head hurts a little")).toEqual([]); // not "worst" or "thunderclap"
    expect(scanForRedFlags("My ankle is sprained")).toEqual([]);
    expect(scanForRedFlags("Just a runny nose and cough")).toEqual([]);
  });
});

describe("mergeFlags", () => {
  test("unions LLM-reported flags and keyword-scanned flags", () => {
    const merged = mergeFlags(["dyspnea"], "I have crushing chest pain");
    expect(new Set(merged)).toEqual(new Set(["dyspnea", "chest_pain"]));
  });

  test("drops a single unknown LLM flag on benign text", () => {
    expect(mergeFlags(["none"], "I have a sore throat")).toEqual([]);
  });

  test("drops multiple unknown LLM flags on benign text", () => {
    expect(mergeFlags(["urgent", "panic"], "I have a sore throat")).toEqual([]);
  });

  test("keeps valid LLM flags and drops unknown ones", () => {
    expect(new Set(mergeFlags(["chest_pain", "urgent"], "benign text"))).toEqual(
      new Set(["chest_pain"]),
    );
  });
});

describe("shouldEscalate", () => {
  test("returns true iff at least one flag is present", () => {
    expect(shouldEscalate([])).toBe(false);
    expect(shouldEscalate(["chest_pain"])).toBe(true);
    expect(shouldEscalate(["chest_pain", "dyspnea"])).toBe(true);
  });
});
