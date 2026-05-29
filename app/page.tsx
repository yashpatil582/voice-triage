"use client";

import { useCallback, useRef, useState } from "react";
import type { IntakeSummary, Turn } from "@/lib/prompts";

type Message = { role: "user" | "assistant"; content: string };
type Status = "idle" | "recording" | "transcribing" | "thinking" | "speaking" | "done";

const MAX_TURNS = 6;

function speakText(text: string, onEnd: () => void) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    onEnd();
    return;
  }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1.0;
  utter.pitch = 1.0;
  utter.onend = onEnd;
  utter.onerror = onEnd;
  window.speechSynthesis.speak(utter);
}

export default function Page() {
  const [status, setStatus] = useState<Status>("idle");
  const [history, setHistory] = useState<Message[]>([]);
  const [textInput, setTextInput] = useState<string>("");
  const [safetyFlags, setSafetyFlags] = useState<string[]>([]);
  const [disposition, setDisposition] = useState<Turn["triage_disposition"]>("unknown");
  const [summary, setSummary] = useState<IntakeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const turnCount = history.filter((m) => m.role === "user").length;

  const handleAgentTurn = useCallback(
    async (userText: string) => {
      setStatus("thinking");
      setError(null);
      const newHistory: Message[] = [...history, { role: "user", content: userText }];
      setHistory(newHistory);

      try {
        const r = await fetch("/api/respond", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ history, userText }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "respond failed");
        const turn: Turn = data.turn;

        setSafetyFlags(turn.safety_flags);
        setDisposition(turn.triage_disposition);
        setHistory([...newHistory, { role: "assistant", content: turn.reply }]);

        setStatus("speaking");
        speakText(turn.reply, async () => {
          if (turn.end_conversation || turnCount + 1 >= MAX_TURNS) {
            // Generate summary
            const sumR = await fetch("/api/summarize", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                history: [...newHistory, { role: "assistant", content: turn.reply }],
              }),
            });
            const sumData = await sumR.json();
            if (sumR.ok) setSummary(sumData.summary);
            setStatus("done");
          } else {
            setStatus("idle");
          }
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "unknown error");
        setStatus("idle");
      }
    },
    [history, turnCount],
  );

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setStatus("transcribing");
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const form = new FormData();
        form.append("audio", blob);
        try {
          const r = await fetch("/api/transcribe", { method: "POST", body: form });
          const data = await r.json();
          if (!r.ok) throw new Error(data.error || "transcribe failed");
          const text = (data.text as string).trim();
          if (text) {
            await handleAgentTurn(text);
          } else {
            setError("Couldn't hear anything. Try again or use text mode.");
            setStatus("idle");
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : "transcription error");
          setStatus("idle");
        }
      };

      recorder.start();
      setStatus("recording");
    } catch (e) {
      setError(
        e instanceof Error
          ? `Mic permission denied or unavailable: ${e.message}. Use text mode below.`
          : "mic error",
      );
      setStatus("idle");
    }
  }, [handleAgentTurn]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const submitText = useCallback(() => {
    if (!textInput.trim()) return;
    const text = textInput.trim();
    setTextInput("");
    void handleAgentTurn(text);
  }, [textInput, handleAgentTurn]);

  const reset = useCallback(() => {
    window.speechSynthesis?.cancel();
    setStatus("idle");
    setHistory([]);
    setSafetyFlags([]);
    setDisposition("unknown");
    setSummary(null);
    setError(null);
  }, []);

  const escalating = safetyFlags.length > 0;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">voice-triage</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Open-source clinical intake voice agent. Whisper → Llama 3.3 70B → browser TTS.
        </p>
      </header>

      <div className="mb-6 rounded-lg border border-warn/40 bg-warn/10 p-4 text-sm">
        <strong className="text-warn">Research demo only.</strong> This is not a medical device. If
        you are experiencing a medical emergency, call 911 (US) or your local emergency number.
      </div>

      {escalating && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-6 rounded-lg border border-danger bg-danger/15 p-4"
        >
          <div className="text-base font-semibold text-danger">⚠ Possible emergency detected</div>
          <div className="mt-1 text-sm">
            Red flags: {safetyFlags.join(", ")}. If real, call 911 or go to the nearest ER now.
          </div>
        </div>
      )}

      <section className="mb-6 space-y-3">
        {history.map((m, i) => (
          <div
            key={i}
            className={`rounded-lg border px-4 py-3 text-sm ${
              m.role === "assistant"
                ? "border-accent/30 bg-accent/5"
                : "border-foreground/15 bg-foreground/5"
            }`}
          >
            <div className="mb-1 text-xs uppercase tracking-wider text-foreground/50">
              {m.role === "assistant" ? "Agent" : "You"}
            </div>
            <div>{m.content}</div>
          </div>
        ))}
        <div aria-live="polite">
          {status === "thinking" && (
            <div className="text-sm text-foreground/50">Agent is thinking…</div>
          )}
          {status === "transcribing" && (
            <div className="text-sm text-foreground/50">Transcribing…</div>
          )}
        </div>
      </section>

      {status !== "done" && (
        <section className="mb-6 flex flex-wrap items-center gap-3">
          {status === "recording" ? (
            <button
              className="rounded-full bg-danger px-6 py-3 text-sm font-medium text-white"
              onClick={stopRecording}
            >
              ■ Stop & send
            </button>
          ) : (
            <button
              className="rounded-full bg-accent px-6 py-3 text-sm font-medium text-white disabled:opacity-50"
              onClick={startRecording}
              disabled={status !== "idle"}
            >
              🎤 {turnCount === 0 ? "Start" : "Speak again"}
            </button>
          )}
          {turnCount > 0 && (
            <button
              className="rounded-full border border-foreground/20 px-4 py-3 text-xs"
              onClick={reset}
            >
              Reset
            </button>
          )}
        </section>
      )}

      <section className="mb-6">
        <details className="rounded-lg border border-foreground/15 p-4">
          <summary className="cursor-pointer text-xs uppercase tracking-wider text-foreground/50">
            Text mode (no mic needed)
          </summary>
          <div className="mt-3 flex gap-2">
            <input
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitText()}
              placeholder='e.g. "I have a sore throat for 3 days."'
              className="flex-1 rounded-md border border-foreground/20 bg-transparent px-3 py-2 text-sm"
              disabled={status !== "idle"}
            />
            <button
              className="rounded-md bg-foreground/10 px-4 py-2 text-sm disabled:opacity-50"
              onClick={submitText}
              disabled={status !== "idle" || !textInput.trim()}
            >
              Send
            </button>
          </div>
        </details>
      </section>

      {error && (
        <div className="mb-6 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {summary && (
        <section className="mb-6 rounded-lg border border-accent/40 bg-accent/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Intake summary</h2>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                summary.disposition === "er_referral"
                  ? "bg-danger text-white"
                  : summary.disposition === "urgent_care"
                  ? "bg-warn text-white"
                  : "bg-accent text-white"
              }`}
            >
              {summary.disposition.replace("_", " ")}
            </span>
          </div>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-foreground/50">Chief complaint</dt>
              <dd>{summary.chief_complaint}</dd>
            </div>
            <div>
              <dt className="text-foreground/50">Onset / duration</dt>
              <dd>
                {summary.hpi.onset || "—"} · {summary.hpi.duration || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-foreground/50">Severity / quality</dt>
              <dd>
                {summary.hpi.severity || "—"} · {summary.hpi.quality || "—"}
              </dd>
            </div>
            {summary.red_flags.length > 0 && (
              <div>
                <dt className="text-foreground/50">Red flags</dt>
                <dd className="text-danger">{summary.red_flags.join(", ")}</dd>
              </div>
            )}
            <div>
              <dt className="text-foreground/50">Rationale</dt>
              <dd>{summary.rationale}</dd>
            </div>
          </dl>
          <div className="mt-4 flex gap-2">
            <button
              className="rounded-md bg-foreground/10 px-3 py-1.5 text-xs"
              onClick={() => {
                const blob = new Blob([JSON.stringify(summary, null, 2)], {
                  type: "application/json",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "intake-summary.json";
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download JSON
            </button>
            <button
              className="rounded-md border border-foreground/20 px-3 py-1.5 text-xs"
              onClick={reset}
            >
              New conversation
            </button>
          </div>
        </section>
      )}

      <footer className="mt-12 text-xs text-foreground/40">
        <div className="mb-1">
          Turn {turnCount} / {MAX_TURNS} · disposition: <span className="font-mono">{disposition}</span>
        </div>
        <div>
          <a
            href="https://github.com/yashpatil582/voice-triage"
            className="hover:text-foreground/70"
            target="_blank"
            rel="noopener noreferrer"
          >
            github.com/yashpatil582/voice-triage
          </a>
        </div>
      </footer>
    </main>
  );
}
