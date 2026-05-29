/**
 * Turn handler. Receives the conversation history + the latest user
 * utterance, returns a structured Turn (reply text + safety flags +
 * disposition + end_conversation).
 */
import { NextRequest, NextResponse } from "next/server";
import { llmClient, llmModel } from "@/lib/groq";
import { TurnSchema, TURN_SYSTEM_PROMPT, type Turn } from "@/lib/prompts";
import { mergeFlags } from "@/lib/safety";

export const runtime = "nodejs";
export const maxDuration = 30;

type Message = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const history: Message[] = Array.isArray(body.history) ? body.history : [];
    const userText: string = typeof body.userText === "string" ? body.userText : "";

    if (!userText.trim()) {
      return NextResponse.json({ error: "missing 'userText'" }, { status: 400 });
    }

    const client = llmClient();
    const response = await client.chat.completions.create({
      model: llmModel(),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: TURN_SYSTEM_PROMPT },
        ...history,
        { role: "user", content: userText },
      ],
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) {
      return NextResponse.json({ error: "empty LLM response" }, { status: 502 });
    }

    let parsed: Turn;
    try {
      parsed = TurnSchema.parse(JSON.parse(raw));
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "schema validation failed";
      return NextResponse.json({ error: `LLM returned malformed JSON: ${errMsg}`, raw }, { status: 502 });
    }

    // Belt-and-suspenders: scan the user's own text for red flags the LLM may have missed.
    const merged = mergeFlags(parsed.safety_flags, userText);
    const escalating = merged.length > 0;
    const finalTurn: Turn = {
      ...parsed,
      safety_flags: merged,
      triage_disposition: escalating ? "er_referral" : parsed.triage_disposition,
      end_conversation: escalating ? true : parsed.end_conversation,
    };

    return NextResponse.json({ turn: finalTurn });
  } catch (err) {
    const message = err instanceof Error ? err.message : "respond failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
