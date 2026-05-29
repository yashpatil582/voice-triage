/**
 * Single LLM client factory. Reads GROQ_API_KEY at request time.
 *
 * Defaults to Groq's OpenAI-compatible endpoint. To point at any other
 * OpenAI-compatible backend (Ollama, vLLM, OpenAI, etc.), set
 * `OPEN_SCRIBE_BASE_URL` and `OPEN_SCRIBE_API_KEY`.
 */
import OpenAI from "openai";

export const DEFAULT_LLM_MODEL = "llama-3.3-70b-versatile";
export const DEFAULT_STT_MODEL = "whisper-large-v3";

export function llmClient(): OpenAI {
  const baseURL = process.env.OPEN_SCRIBE_BASE_URL ?? "https://api.groq.com/openai/v1";
  const apiKey =
    process.env.OPEN_SCRIBE_API_KEY ??
    process.env.GROQ_API_KEY ??
    (() => {
      throw new Error("Missing GROQ_API_KEY (or OPEN_SCRIBE_API_KEY) env var");
    })();
  return new OpenAI({ baseURL, apiKey });
}

export function llmModel(): string {
  return process.env.OPEN_SCRIBE_MODEL ?? DEFAULT_LLM_MODEL;
}

export function sttModel(): string {
  return process.env.OPEN_SCRIBE_STT_MODEL ?? DEFAULT_STT_MODEL;
}
