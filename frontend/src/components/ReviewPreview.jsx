import { ChevronDown, FileCode2, GitPullRequest } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { highlightLine } from "../lib/highlight.jsx";
import { severityById } from "../lib/severity.js";
import SeverityTag from "./SeverityTag.jsx";

const DECISION_LABEL = {
  approve: "Approve",
  request_changes: "Request changes",
  comment: "Comment",
};

function InlineComment({ comment, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const detailsId = useId();
  return (
    <div className="inline-comment" data-severity={comment.severity}>
      <div className="inline-comment-head">
        <img src="/prhawk-mark.png" width="20" height="20" alt="" />
        <span className="inline-comment-author">PRHawk</span>
        <SeverityTag severity={comment.severity} />
        <span className="inline-comment-line num">line {comment.line}</span>
      </div>
      <p className="inline-comment-issue">{comment.issue}</p>
      <button
        type="button"
        className="inline-comment-toggle"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDown size={16} aria-hidden="true" />
        {open ? "Hide details" : "Why it matters and the fix"}
      </button>
      <dl className="inline-comment-details" id={detailsId} hidden={!open}>
        <div>
          <dt>Why it matters</dt>
          <dd>{comment.whyItMatters}</dd>
        </div>
        <div>
          <dt>Suggested fix</dt>
          <dd>{comment.suggestedFix}</dd>
        </div>
      </dl>
    </div>
  );
}

function DiffFile({ file, comments, lineLimit, openLine }) {
  const lines = lineLimit ? file.lines.slice(0, lineLimit) : file.lines;
  const byLine = new Map(comments.map((comment) => [comment.line, comment]));
  return (
    <div className="diff">
      <div className="diff-head">
        <FileCode2 size={16} aria-hidden="true" />
        <span className="diff-path">{file.path}</span>
        <span className="diff-stat num">+{file.lines.length}</span>
      </div>
      <div className="diff-body" role="table" aria-label={`Changes in ${file.path}`}>
        {lines.map((text, index) => {
          const lineNumber = index + 1;
          const comment = byLine.get(lineNumber);
          return (
            <div key={lineNumber} role="rowgroup">
              <div className={`diff-row${comment ? " has-comment" : ""}`} role="row">
                <span className="diff-ln num" role="cell">{lineNumber}</span>
                <span className="diff-sign" role="cell" aria-label="added">+</span>
                <code className="diff-code" role="cell">{highlightLine(text)}</code>
              </div>
              {comment && (
                <div role="row">
                  <div role="cell">
                    <InlineComment comment={comment} defaultOpen={comment.line === openLine} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A PRHawk review rendered the way GitHub shows it: the risk summary and the
 * changed file with inline comments. `compact` shows the first lines only.
 */
export default function ReviewPreview({ review, variant = "full" }) {
  const [filter, setFilter] = useState("all");
  const compact = variant === "compact";

  const counts = useMemo(() => {
    const map = new Map();
    for (const comment of review.comments) map.set(comment.severity, (map.get(comment.severity) ?? 0) + 1);
    return [...map.entries()];
  }, [review.comments]);

  const visibleComments = filter === "all" ? review.comments : review.comments.filter((c) => c.severity === filter);
  const { summary } = review;

  return (
    <div className={`review review-${variant}`}>
      <div className="review-head">
        <GitPullRequest size={18} aria-hidden="true" className="review-pr-icon" />
        <div className="review-head-text">
          <p className="review-title">
            {review.title} <span className="num">#{review.number}</span>
          </p>
          <p className="review-meta">
            {review.author} wants to merge <code>{review.head}</code> into <code>{review.base}</code>
          </p>
        </div>
        <span className="review-diffstat num">
          <span className="add">+{review.additions}</span> <span className="del">-{review.deletions}</span>
        </span>
      </div>

      <div className="review-layout">
        <aside className="review-summary" aria-label="PRHawk risk summary">
          <div className="review-score">
            <span className="review-score-value num">{summary.qualityScore}</span>
            <span className="review-score-max num">/100</span>
          </div>
          <p className="review-score-label">Quality score</p>
          <div className="review-score-bar" aria-hidden="true">
            <span style={{ transform: `scaleX(${summary.qualityScore / 100})` }} />
          </div>
          <p className="review-decision" data-decision={summary.mergeDecision}>
            {DECISION_LABEL[summary.mergeDecision]}
          </p>

          {!compact && (
            <>
              <div className="review-filter" role="group" aria-label="Filter comments by severity">
                <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
                  All findings <span className="num">{review.comments.length}</span>
                </button>
                {counts.map(([severity, count]) => (
                  <button
                    key={severity}
                    type="button"
                    aria-pressed={filter === severity}
                    onClick={() => setFilter(severity)}
                    data-severity={severity}
                  >
                    {severityById[severity]?.label ?? severity} <span className="num">{count}</span>
                  </button>
                ))}
              </div>
              <div className="review-risks">
                <p className="review-side-label">Highest-risk changes</p>
                <ul>
                  {summary.highestRiskChanges.map((risk) => (
                    <li key={risk}>{risk}</li>
                  ))}
                </ul>
              </div>
              <div className="review-files">
                <p className="review-side-label">Files</p>
                <a href="#review-file" className="review-file-link" aria-current="true">
                  <FileCode2 size={15} aria-hidden="true" />
                  {review.file.path}
                  <span className="num">{review.comments.length}</span>
                </a>
              </div>
            </>
          )}
        </aside>

        <div className="review-main" id={compact ? undefined : "review-file"}>
          <DiffFile
            file={review.file}
            comments={visibleComments}
            lineLimit={compact ? 5 : undefined}
            openLine={compact ? review.comments[0]?.line : review.comments.find((c) => c.severity === "bug")?.line}
          />
          {!compact && (
            <p className="review-rationale">
              <strong>Rationale.</strong> {summary.rationale}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
