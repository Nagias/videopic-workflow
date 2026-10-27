import type { ClipDuration } from "../../shared/providers";

export function formatVideoPrompt(prompt: string, durationSec: ClipDuration): string {
  const action = prompt.trim();
  if (!action) throw new Error("Prompt đang trống");
  const tags = [
    `[Duration: ${durationSec}s]`,
    "[Mode: Text-to-Video Motion Generation]",
    `Action: ${action}`,
    "Pacing: cinematic 24fps smooth pacing",
    "16:9 landscape",
  ];
  return `tạo cho tôi 1 video ${durationSec}s: ${tags.join(", ")}`;
}
