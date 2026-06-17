import React, { useState, useEffect } from "react";
import { 
  GitPullRequest, 
  Search, 
  AlertTriangle, 
  CheckCircle, 
  HelpCircle, 
  Copy, 
  Check, 
  FileText, 
  Filter, 
  Clock, 
  Info,
  ChevronRight,
  Code,
  Lightbulb,
  Zap
} from "lucide-react";

export default function ReviewTab({ accessKey, addToast }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0); // 0 to 4
  const [result, setResult] = useState(null);
  const [severityFilter, setSeverityFilter] = useState("all");
  const [searchPath, setSearchPath] = useState("");
  const [copiedIndex, setCopiedIndex] = useState(null);

  // Loader stage descriptions
  const loaderStages = [
    "Fetching Pull Request details from GitHub...",
    "Parsing changed files and diff patches...",
    "Consulting your team's learned conventions...",
    "Generating AI review comments and quality report..."
  ];

  // Simulated multi-stage progress animation
  useEffect(() => {
    let timers = [];
    if (loading) {
      setStage(0);
      timers.push(setTimeout(() => setStage(1), 1500));
      timers.push(setTimeout(() => setStage(2), 3500));
      timers.push(setTimeout(() => setStage(3), 6000));
    } else {
      setStage(0);
    }
    return () => timers.forEach(t => clearTimeout(t));
  }, [loading]);

  const handleReview = async (e) => {
    e.preventDefault();
    if (!url.trim()) {
      addToast("Please enter a valid GitHub PR URL.", "error");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const customGithubToken = localStorage.getItem("code_reviewer_github_token") || "";
      const customOpenRouterKey = localStorage.getItem("code_reviewer_openrouter_key") || "";

      const response = await fetch("/api/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessKey ? { "x-access-key": accessKey } : {}),
          ...(customGithubToken ? { "x-github-token": customGithubToken } : {}),
          ...(customOpenRouterKey ? { "x-openrouter-key": customOpenRouterKey } : {})
        },
        body: JSON.stringify({ url: url.trim() })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to run review");
      }

      setResult(data);
      addToast("Code review completed successfully!", "success");
    } catch (err) {
      console.error(err);
      addToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    addToast("Code fix copied to clipboard!", "success");
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Helper to determine score color
  const getScoreColor = (score) => {
    if (score >= 80) return "var(--color-safe)";
    if (score >= 50) return "var(--color-performance)";
    return "var(--color-bug)";
  };

  // Helper for Decision Badges
  const renderDecisionBadge = (decision) => {
    switch(decision) {
      case "approve":
        return <span className="badge badge-safe">Approve</span>;
      case "request_changes":
        return <span className="badge badge-bug">Request Changes</span>;
      case "comment":
      default:
        return <span className="badge badge-performance">Comment</span>;
    }
  };

  // Filter & Search Comments
  const filteredComments = result?.comments?.filter(comment => {
    const matchesSeverity = severityFilter === "all" || comment.severity === severityFilter;
    const matchesPath = comment.path.toLowerCase().includes(searchPath.toLowerCase());
    return matchesSeverity && matchesPath;
  }) || [];

  // Group comments by file path
  const commentsByFile = filteredComments.reduce((acc, comment) => {
    if (!acc[comment.path]) {
      acc[comment.path] = [];
    }
    acc[comment.path].push(comment);
    return acc;
  }, {});

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Search Input Card */}
      <div className="review-input-section">
        <h2 className="review-input-title">Code Reviewer</h2>
        <p className="review-input-subtitle">Paste a GitHub pull request URL to audit changes against conventions</p>
        
        <form onSubmit={handleReview}>
          <div className="pr-input-container">
            <input 
              type="text" 
              placeholder="e.g., https://github.com/owner/repo/pull/42"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
            />
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? (
                <>
                  <Clock size={18} className="spin" /> Reviewing...
                </>
              ) : (
                <>
                  <GitPullRequest size={18} /> Run Review
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="card">
          <div className="loader-container">
            <div className="loader-spinner"></div>
            <div style={{ textAlign: "center" }}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: "700", marginBottom: "0.25rem" }}>Reviewing Pull Request</h3>
              <p style={{ fontSize: "0.85rem", color: "var(--t3)" }}>This can take up to a minute depending on the size of the changes</p>
            </div>
            
            <div className="loader-stages">
              {loaderStages.map((stageText, idx) => {
                let statusClass = "";
                if (stage > idx) statusClass = "completed";
                else if (stage === idx) statusClass = "active";

                return (
                  <div key={idx} className={`loader-stage-item ${statusClass}`}>
                    <div className="loader-stage-bullet">
                      {stage > idx && <Check size={10} />}
                    </div>
                    <span>{stageText}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Review Results Dashboard */}
      {result && !loading && (
        <>
          <div className="dashboard-grid">
            {/* Circular Quality Gauge */}
            <div className="card score-card">
              <div 
                className="score-gauge" 
                style={{ 
                  "--score-percent": `${result.summary.qualityScore}%`,
                  "--score-color": getScoreColor(result.summary.qualityScore)
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span className="score-value">{result.summary.qualityScore}</span>
                  <span className="score-label">Score</span>
                </div>
              </div>
              <h3 style={{ fontSize: "1.15rem", fontWeight: "700", marginBottom: "0.5rem" }}>Code Quality Rating</h3>
              <p style={{ fontSize: "0.85rem", color: "var(--t2)", maxWidth: "220px" }}>
                Score is based on convention alignment, bug frequency, and performance risks.
              </p>
            </div>

            {/* Overview / Decisions */}
            <div className="card results-overview-card">
              <div className="card-title">
                <GitPullRequest size={20} className="file-icon" />
                Review Outcome
              </div>
              
              <div className="overview-row">
                <div className="overview-label">Decision:</div>
                <div className="overview-content">
                  {renderDecisionBadge(result.summary.mergeDecision)}
                </div>
              </div>

              <div className="overview-row">
                <div className="overview-label">Rationale:</div>
                <div className="overview-content" style={{ fontWeight: "500", color: "var(--t1)" }}>
                  {result.summary.rationale}
                </div>
              </div>

              {result.summary.highestRiskChanges && result.summary.highestRiskChanges.length > 0 && (
                <div className="overview-row">
                  <div className="overview-label">High-Risk Changes:</div>
                  <div className="overview-content" style={{ flex: 1 }}>
                    <ul className="risk-list">
                      {result.summary.highestRiskChanges.map((change, idx) => (
                        <li key={idx} className="risk-item">{change}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <div className="overview-row" style={{ marginTop: "auto", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
                <div className="overview-label">Conventions:</div>
                <div className="overview-content" style={{ fontSize: "0.85rem", color: "var(--t2)" }}>
                  Audited with <strong>{result.conventionsUsed}</strong> custom convention rules.
                </div>
              </div>
            </div>
          </div>

          {/* Findings Header */}
          <div className="findings-section-header">
            <h2 className="section-title">Review Findings ({result.comments.length})</h2>
            
            {/* Filters */}
            <div className="filters-bar">
              <div style={{ position: "relative", marginRight: "0.5rem" }}>
                <input
                  type="text"
                  placeholder="Search file path..."
                  className="input-text"
                  value={searchPath}
                  onChange={(e) => setSearchPath(e.target.value)}
                  style={{ paddingRight: "2rem", width: "180px", fontSize: "0.85rem", padding: "0.4rem 0.75rem" }}
                />
                <Search size={14} style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--t3)" }} />
              </div>

              <button 
                onClick={() => setSeverityFilter("all")} 
                className={`filter-chip ${severityFilter === "all" ? "active" : ""}`}
              >
                All
              </button>
              <button 
                onClick={() => setSeverityFilter("bug")} 
                className={`filter-chip ${severityFilter === "bug" ? "active" : ""}`}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "var(--color-bug)" }}></span>
                Bugs
              </button>
              <button 
                onClick={() => setSeverityFilter("security")} 
                className={`filter-chip ${severityFilter === "security" ? "active" : ""}`}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "var(--color-security)" }}></span>
                Security
              </button>
              <button 
                onClick={() => setSeverityFilter("performance")} 
                className={`filter-chip ${severityFilter === "performance" ? "active" : ""}`}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "var(--color-performance)" }}></span>
                Perf
              </button>
              <button 
                onClick={() => setSeverityFilter("style")} 
                className={`filter-chip ${severityFilter === "style" ? "active" : ""}`}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "var(--color-style)" }}></span>
                Style
              </button>
              <button 
                onClick={() => setSeverityFilter("suggestion")} 
                className={`filter-chip ${severityFilter === "suggestion" ? "active" : ""}`}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "var(--color-suggestion)" }}></span>
                Suggest
              </button>
            </div>
          </div>

          {/* Empty findings state */}
          {filteredComments.length === 0 && (
            <div className="empty-state">
              <CheckCircle size={40} style={{ color: "var(--color-safe)" }} />
              <div className="empty-state-title">No Findings Match Filters</div>
              <div className="empty-state-desc">Your code changes align perfectly with the selected severity filters.</div>
            </div>
          )}

          {/* Inline Comments Grouped By File */}
          {Object.keys(commentsByFile).map((filePath) => (
            <div key={filePath} className="file-group">
              <div className="file-header">
                <FileText size={16} className="file-icon" />
                <span>{filePath}</span>
                <span className="file-comment-count">{commentsByFile[filePath].length}</span>
              </div>
              
              <div className="file-comments-container">
                {commentsByFile[filePath].map((comment, index) => {
                  const globalIndex = result.comments.indexOf(comment);
                  return (
                    <div key={index} className={`diagnostic-card sev-${comment.severity}`}>
                      {/* Colored severity accent bar */}
                      <div className="diag-accent-bar" />

                      <div className="diag-body">
                        {/* Card Header: badge + line pill */}
                        <div className="diag-header">
                          <div className="diag-header-left">
                            <span className={`badge badge-${comment.severity}`}>{comment.severity}</span>
                            <span className="diag-line-pill">L{comment.line}</span>
                          </div>
                        </div>

                        {/* Issue Title */}
                        <div className="diag-issue">{comment.issue}</div>

                        {/* Why It Matters — tinted callout */}
                        <div className={`diag-why sev-bg-${comment.severity}`}>
                          <div className="diag-why-label">
                            <Lightbulb size={13} />
                            Why it matters
                          </div>
                          <p className="diag-why-text">{comment.whyItMatters}</p>
                        </div>

                        {/* Suggested Fix — IDE-style code panel */}
                        <div className="diag-fix-panel">
                          <div className="diag-fix-header">
                            <div className="diag-fix-header-left">
                              <Zap size={13} />
                              Suggested Fix
                            </div>
                            <button
                              className="diag-copy-btn"
                              onClick={() => copyToClipboard(comment.suggestedFix, globalIndex)}
                              title="Copy fix"
                            >
                              {copiedIndex === globalIndex
                                ? <><Check size={13} /> Copied</>
                                : <><Copy size={13} /> Copy</>}
                            </button>
                          </div>
                          <pre className="diag-fix-code">{comment.suggestedFix}</pre>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Initial Empty State */}
      {!result && !loading && (
        <div className="empty-state">
          <GitPullRequest size={48} className="empty-state-icon" />
          <div className="empty-state-title">No Reviews Executed Yet</div>
          <div className="empty-state-desc">
            Paste a GitHub PR URL at the top to start auditing code quality and conventions.
          </div>
        </div>
      )}
    </div>
  );
}
