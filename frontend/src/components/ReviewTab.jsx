import { useState, useEffect } from "react";
import { GitPullRequest } from "lucide-react";
import { runReview } from "../lib/api";
import { STORAGE_KEYS } from "../lib/storageKeys";
import usePersistentState from "../hooks/usePersistentState";
import ReviewForm from "./review/ReviewForm";
import ReviewLoader from "./review/ReviewLoader";
import ReviewSummary from "./review/ReviewSummary";
import FindingsToolbar from "./review/FindingsToolbar";
import FindingsList from "./review/FindingsList";

export default function ReviewTab({ accessKey, addToast }) {
  // Persisted so the last review and its URL survive a page refresh.
  const [url, setUrl] = usePersistentState(STORAGE_KEYS.reviewUrl, "");
  const [result, setResult] = usePersistentState(STORAGE_KEYS.reviewResult, null, { json: true });

  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0); // 0 to 4
  const [severityFilter, setSeverityFilter] = useState("all");
  const [searchPath, setSearchPath] = useState("");
  const [copiedIndex, setCopiedIndex] = useState(null);

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
    return () => timers.forEach((t) => clearTimeout(t));
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
      const data = await runReview(url.trim(), accessKey);
      setResult(data);
      if (data.postWarning) {
        addToast(`Review generated, but not posted to GitHub: ${data.postWarning}`, "error");
      } else {
        addToast("Code review completed successfully!", "success");
      }
    } catch (err) {
      console.error(err);
      addToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // Wipe the persisted review and reset the tab to a clean slate.
  const handleClearReview = () => {
    setResult(null);
    setUrl("");
    setSeverityFilter("all");
    setSearchPath("");
    setCopiedIndex(null);
  };

  const copyToClipboard = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    addToast("Code fix copied to clipboard!", "success");
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Filter & Search Comments
  const filteredComments = result?.comments?.filter((comment) => {
    const matchesSeverity = severityFilter === "all" || comment.severity === severityFilter;
    const matchesPath = comment.path.toLowerCase().includes(searchPath.toLowerCase());
    return matchesSeverity && matchesPath;
  }) || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <ReviewForm url={url} setUrl={setUrl} loading={loading} onSubmit={handleReview} />

      {loading && <ReviewLoader stage={stage} />}

      {result && !loading && (
        <>
          <ReviewSummary result={result} />

          <FindingsToolbar
            total={result.comments.length}
            severityFilter={severityFilter}
            setSeverityFilter={setSeverityFilter}
            searchPath={searchPath}
            setSearchPath={setSearchPath}
            onClear={handleClearReview}
          />

          <FindingsList
            allComments={result.comments}
            filteredComments={filteredComments}
            copiedIndex={copiedIndex}
            onCopy={copyToClipboard}
          />
        </>
      )}

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
