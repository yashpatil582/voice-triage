/**
 * Final-summary generator. Called when the conversation ends.
 * Returns a structured IntakeSummary derived from the full transcript.
 */
import { NextRequest, NextResponse } from "next/server";
import { llmClient, llmModel } from "@/lib/groq";
import { IntakeSummarySchema, SUMMARY_SYSTEM_PROMPT, type IntakeSummary } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 30;

type Message = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const history: Message[] = Array.isArray(body.history) ? body.history : [];
    if (history.length === 0) {
      return NextResponse.json({ error: "empty history" }, { status: 400 });
    }

    const formatted = history
      .map((m) => `${m.role === "user" ? "PATIENT" : "AGENT"}: ${m.content}`)
      .join("\n");

    const client = llmClient();
    const response = await client.chat.completions.create({
      model: llmModel(),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        { role: "user", content: `Conversation transcript:\n\n${formatted}` },
      ],
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) {
      return NextResponse.json({ error: "empty LLM response" }, { status: 502 });
    }

    let summary: IntakeSummary;
    try {
      summary = IntakeSummarySchema.parse(JSON.parse(raw));
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "schema validation failed";
      return NextResponse.json({ error: `LLM returned malformed JSON: ${errMsg}`, raw }, { status: 502 });
    }

    return NextResponse.json({ summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "summarize failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
