export const teamAvatarPresets = [
  { key: "fox", name: "Amber fox", animal: "fox", background: "#FDE7C7", foreground: "#A44316" },
  { key: "owl", name: "Indigo owl", animal: "owl", background: "#E4E7FF", foreground: "#4F46A5" },
  { key: "panda", name: "Cloud panda", animal: "panda", background: "#E8EDF2", foreground: "#24303B" },
  { key: "otter", name: "Cocoa otter", animal: "otter", background: "#EFE0D2", foreground: "#73472E" },
  { key: "cat", name: "Mint cat", animal: "cat", background: "#D9F5E9", foreground: "#0F766E" },
  { key: "bear", name: "Rose bear", animal: "bear", background: "#F8DFE5", foreground: "#9F3A56" },
  { key: "rabbit", name: "Sky rabbit", animal: "rabbit", background: "#DCEEFF", foreground: "#25638F" },
  { key: "tiger", name: "Sunset tiger", animal: "tiger", background: "#FFE5C2", foreground: "#B45309" },
] as const;

export type TeamAvatarPresetKey = (typeof teamAvatarPresets)[number]["key"];

export function isTeamAvatarPresetKey(value: unknown): value is TeamAvatarPresetKey {
  return typeof value === "string" && teamAvatarPresets.some((preset) => preset.key === value);
}

export function fallbackAvatarPresetKey(seed: string): TeamAvatarPresetKey {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return teamAvatarPresets[hash % teamAvatarPresets.length].key;
}

export function composerAction(input: { key: string; shiftKey: boolean; isComposing: boolean; sending: boolean; value: string }) {
  if (input.key !== "Enter" || input.shiftKey || input.isComposing || input.sending || !input.value.trim()) return "newline" as const;
  if (input.value.trim().toLocaleLowerCase() === "/model") return "model" as const;
  return "send" as const;
}

export function isModelCommand(value: string) {
  return value.trim().toLocaleLowerCase() === "/model";
}
