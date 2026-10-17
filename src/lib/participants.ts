export const ugBatches = [
  { value: "2021", label: "Interns" },
  ...["2022", "2023", "2024", "2025", "2026"].map((value) => ({ value, label: value })),
];
export const participantLabels = { ug: "UG", pg: "PG", jr: "JR", faculty: "Faculty" };
export type ParticipantCategory = keyof typeof participantLabels;
export function batchDisplay(label: string) { return label === "2021" ? "Interns" : label; }
