import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "voice-triage — open-source clinical intake voice agent",
  description:
    "Research demo: voice-first symptom-intake agent. Talk into your browser, get a structured intake summary and red-flag triage decision.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground min-h-screen antialiased">{children}</body>
    </html>
  );
}
