# voice-triage

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![Deploy on Vercel](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel)](https://vercel.com)

Open-source, voice-first clinical intake agent. Talk into your browser → multi-turn symptom intake → structured triage decision with red-flag detection.

> **⚠️ Research demo only.** This is not a medical device and must not be used for real triage. If you are experiencing a medical emergency, call 911 (US) or your local emergency number.

**Live demo:** **https://voice-triage.vercel.app** — open in a Chromium-based browser, allow mic, click 🎤.
**Companion project:** [open-scribe](https://github.com/yashpatil582/open-scribe) — batch-pipeline clinical scribe with FHIR output, evaluated on PriMock57 and ACI-Bench.

## What it does

1. You click 🎤 and describe a symptom in plain English (or use text mode).
2. The agent transcribes via Whisper, asks one focused follow-up via Llama 3.3 70B, speaks it back via browser TTS.
3. The loop continues for up to 6 turns. If a red-flag pattern fires (chest pain, severe headache, stroke symptoms, anaphylaxis, etc.), the conversation **immediately escalates** with an ER referral banner.
4. At the end, you get a structured intake summary (chief complaint, HPI, red flags, disposition, rationale) downloadable as JSON.

## Architecture

```
Browser (MediaRecorder)
   │
   ▼  POST /api/transcribe          Groq whisper-large-v3
[user transcript]
   │
   ▼  POST /api/respond             Groq llama-3.3-70b-versatile
                                    → structured Turn { reply, safety_flags, end }
[agent reply text + flags]
   │
   ▼  Browser SpeechSynthesisAPI
[agent voice plays]
   │
   ▼  (loop until end_conversation OR red flag)
   │
   ▼  POST /api/summarize           → structured IntakeSummary
[summary card + JSON download]
```

The LLM is the **primary** safety signal — its `safety_flags` field is checked every turn. A **secondary deterministic regex scan** (`lib/safety.ts`) runs in parallel on the raw user transcript; the UI escalates on the union of both. Better one false positive than one false negative.

## Quickstart

```bash
git clone https://github.com/yashpatil582/voice-triage
cd voice-triage
cp .env.example .env.local      # paste your GROQ_API_KEY
npm install
npm run dev                     # http://localhost:3000
```

Get a free Groq key at [console.groq.com/keys](https://console.groq.com/keys).

### Run the safety unit tests

```bash
npm test
```

### Run the persona eval (uses LLM, costs ~8 calls)

```bash
npm run eval
```

Writes `eval/results/personas.json` and prints a pass/fail table.

## Eval

**Methodology:** 8 synthetic patient personas covering the disposition range (self-care, PCP follow-up, urgent care, ER). For each persona, the agent replays the persona's utterances through the production prompt. A persona PASSES if:

- The final triage disposition matches the expected outcome,
- Every expected safety flag is raised,
- For "must escalate" personas, the conversation ends within the specified turn limit,
- For "must not escalate" personas, no safety flags are raised (no false alarms).

| Backend                    | Personas passed | Notes                           |
|----------------------------|----------------:|---------------------------------|
| Groq llama-3.3-70b-versatile | _(TBD on first eval run)_ |  |

Run `npm run eval` to populate the table.

## Project layout

```
voice-triage/
├── app/
│   ├── page.tsx               # Mic UI, conversation view, summary card
│   ├── layout.tsx
│   └── api/
│       ├── transcribe/        # POST → Groq Whisper
│       ├── respond/           # POST → Llama 3.3 70B, returns Turn
│       └── summarize/         # POST → returns IntakeSummary
├── lib/
│   ├── prompts.ts             # System prompt + Zod schemas
│   ├── safety.ts              # Red-flag regex scanner (deterministic)
│   └── groq.ts                # LLM client factory
├── eval/
│   ├── personas/*.json        # 8 synthetic patient personas
│   ├── run_personas.ts        # Behavioral eval harness
│   └── results/personas.json  # Latest eval output
└── tests/
    └── safety.test.ts         # Unit tests for red-flag detection
```

## Design decisions worth defending

- **Browser TTS not ElevenLabs:** Zero infra, zero cost for v1. The product story is the conversation loop and the safety logic; voice fidelity is a Day 5 polish item. ElevenLabs is a one-file swap when needed.
- **Belt-and-suspenders safety:** The LLM might hallucinate `safety_flags: []` on a clear red flag. Deterministic regex catches that. False-positive cost is low (a banner the user can dismiss); false-negative cost is unbounded.
- **6-turn cap:** Prevents the agent from talking the patient to death. If you don't have enough info in 6 turns, summarize what you have and escalate to PCP.
- **No FHIR here:** FHIR is in [`open-scribe`](https://github.com/yashpatil582/open-scribe). Here the optimization is voice latency and conversation quality, not EMR integration.
- **No persistence in v1:** Conversation state lives in client React. No DB, no auth. Demo, not SaaS.

## Deploy your own

This repo is set up for one-click Vercel deploy:

1. Push to your own GitHub fork.
2. Import the repo at [vercel.com/new](https://vercel.com/new).
3. Set `GROQ_API_KEY` in Vercel project env vars.
4. Deploy. The default region is `iad1`; change to `sfo1` if your traffic is West Coast.

## License

Apache 2.0.
