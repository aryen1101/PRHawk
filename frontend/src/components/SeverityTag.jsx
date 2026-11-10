import { severityById } from "../lib/severity.js";

export default function SeverityTag({ severity, count }) {
  const meta = severityById[severity] ?? { label: severity, icon: null };
  const Icon = meta.icon;
  return (
    <span className="sev-tag" data-severity={severity}>
      {Icon && <Icon size={14} strokeWidth={2} aria-hidden="true" />}
      {meta.label}
      {count !== undefined && <span className="num sev-count">{count}</span>}
    </span>
  );
}
