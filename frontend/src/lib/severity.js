import { Bug, Gauge, Lightbulb, Paintbrush, ShieldAlert } from "lucide-react";

/** PRHawk's five review severities, in priority order (matches the backend schema). */
export const SEVERITIES = [
  { id: "security", label: "Security", icon: ShieldAlert, description: "Unsafe handling of input, secrets or permissions" },
  { id: "bug", label: "Bug", icon: Bug, description: "Incorrect behaviour, a crash or a failing test" },
  { id: "performance", label: "Performance", icon: Gauge, description: "Slower runtime, more memory, worse scaling" },
  { id: "style", label: "Style", icon: Paintbrush, description: "Readability, naming or a team convention" },
  { id: "suggestion", label: "Suggestion", icon: Lightbulb, description: "An optional improvement" },
];

export const severityById = Object.fromEntries(SEVERITIES.map((severity) => [severity.id, severity]));
