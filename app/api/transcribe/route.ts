/**
 * STT proxy. Receives an audio Blob from the browser, forwards to Groq
 * Whisper, returns the plain transcript text.
 */
import { NextRequest, NextResponse } from "next/server";
import { llmClient, sttModel } from "@/lib/groq";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audio = formData.get("audio");
    if (!(audio instanceof Blob)) {
      return NextResponse.json({ error: "missing 'audio' form field" }, { status: 400 });
    }

    const client = llmClient();
    const file = new File([audio], "audio.webm", { type: audio.type || "audio/webm" });

    const transcription = await client.audio.transcriptions.create({
      file,
      model: sttModel(),
      response_format: "json",
      language: "en",
    });

    return NextResponse.json({ text: transcription.text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "transcription failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
