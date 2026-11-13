import { z } from "zod";

export const themeRosterPolicySchema = z.object({
  themeQuestionKey: z.string().min(1).max(80),
  characterQuestionKey: z.string().min(1).max(80),
  sizes: z.record(z.string(), z.number().int().min(1).max(2)),
});
export type ThemeRosterPolicy = z.infer<typeof themeRosterPolicySchema>;

export function themeRosterPolicy(value: unknown): ThemeRosterPolicy | undefined {
  const parsed = themeRosterPolicySchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function questionVisible(key: string, answers: Record<string, string>, policy?: ThemeRosterPolicy) {
  return !policy || key !== policy.characterQuestionKey || Object.hasOwn(policy.sizes, answers[policy.themeQuestionKey] ?? "");
}

export function themeAnswerError(answers: Record<string, string>, policy?: ThemeRosterPolicy) {
  if (!policy) return null;
  if (!Object.hasOwn(policy.sizes, answers[policy.themeQuestionKey] ?? "")) return "Choose your theme.";
  const character = answers[policy.characterQuestionKey] ?? "";
  if (!character.trim()) return "Enter the character you will portray.";
  if ([...character].length > 500) return "Character name must be 500 characters or fewer.";
  return null;
}

export function themeRosterError(themes: (string | null | undefined)[], policy?: ThemeRosterPolicy | null, final = true) {
  if (!policy) return null;
  const theme = themes[0] ?? "";
  const size = Object.hasOwn(policy.sizes, theme) ? policy.sizes[theme] : 0;
  if (!size || themes.some(value => value !== theme)) return "All performers must register for the same theme.";
  if (themes.length > size || (final && themes.length !== size)) return `${theme} requires exactly ${size} ${size === 1 ? "performer" : "performers"}.`;
  return null;
}
