import { AlertTriangle, ArrowRight, CheckCircle, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const installUrl =
  import.meta.env.VITE_GITHUB_APP_INSTALL_URL ||
  "https://github.com/apps/prhawk-webhook-tester/installations/new";
const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const apiUrl = (path) => `${apiBase}${path}`;

export default function SetupPage() {
  const installationId = new URLSearchParams(window.location.search).get("installation_id");
  const [repositories, setRepositories] = useState([]);
  const [targetRepository, setTargetRepository] = useState("");
  const [sourceRepository, setSourceRepository] = useState("");
  const [allowPublicSource, setAllowPublicSource] = useState(false);
  const [loading, setLoading] = useState(Boolean(installationId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!installationId) return;
    fetch(apiUrl(`/api/github/setup?installation_id=${encodeURIComponent(installationId)}`))
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not verify the GitHub App installation.");
        return data;
      })
      .then((data) => {
        setRepositories(data.repositories || []);
        setTargetRepository(data.repositories?.[0]?.fullName || "");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [installationId]);

  const sourceHint = useMemo(
    () => sourceRepository.trim()
      ? "The GitHub App must be installed on this repository too."
      : "Optional. Leave empty to learn only from the selected repository.",
    [sourceRepository],
  );

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSaved(false);
    setSaving(true);
    try {
      const response = await fetch(apiUrl("/api/github/setup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installationId,
          repository: targetRepository,
          conventionSources: sourceRepository.trim() ? [sourceRepository.trim()] : [],
          allowPublicSource,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.missingRepositories?.length) {
          throw new Error(`PRHawk is not installed on: ${data.missingRepositories.join(", ")}`);
        }
        throw new Error(data.error || "Could not save repository configuration.");
      }
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="setup-page">
      <div className="setup-card">
        <a className="setup-brand" href="/">PR<span>Hawk</span>.</a>
        <div className="landing-kicker"><span /> GitHub App setup</div>
        <h1>Configure repository conventions</h1>
        <p className="setup-copy">
          Choose where PRHawk should review. You can optionally use another repository&apos;s learned conventions.
        </p>

        {!installationId && (
          <div className="setup-alert setup-alert-warning">
            <AlertTriangle size={18} />
            <span>Open this page from the GitHub App installation flow so PRHawk can verify your installation.</span>
          </div>
        )}

        {loading && <div className="setup-loading"><LoaderCircle className="spin" size={18} /> Checking installed repositories…</div>}
        {error && <div className="setup-alert setup-alert-error"><AlertTriangle size={18} /><span>{error}</span></div>}

        {!loading && installationId && repositories.length > 0 && (
          <form className="setup-form" onSubmit={handleSubmit}>
            <label>
              Repository to review
              <select value={targetRepository} onChange={(event) => setTargetRepository(event.target.value)} required>
                {repositories.map((repository) => (
                  <option key={repository.fullName} value={repository.fullName}>{repository.fullName}</option>
                ))}
              </select>
            </label>

            <label>
              Convention source repository <span className="setup-optional">(optional)</span>
              <input
                value={sourceRepository}
                onChange={(event) => setSourceRepository(event.target.value)}
                placeholder="owner/shared-rules-repository"
              />
              <small>{sourceHint}</small>
            </label>

            <label className="setup-checkbox">
              <input
                type="checkbox"
                checked={allowPublicSource}
                onChange={(event) => setAllowPublicSource(event.target.checked)}
              />
              <span>Allow public repository sources</span>
            </label>
            <small className="setup-public-note">
              Enable this for public repositories such as <code>redis/redis</code>. Private sources still require the App to be installed.
            </small>

            <button className="btn btn-primary setup-submit" type="submit" disabled={saving || !targetRepository}>
              {saving ? <><LoaderCircle className="spin" size={16} /> Saving…</> : <>Save configuration <ArrowRight size={16} /></>}
            </button>

            {saved && <div className="setup-alert setup-alert-success"><CheckCircle size={18} /><span>Saved. PRHawk will learn conventions and use them in future reviews.</span></div>}
          </form>
        )}

        {!loading && installationId && repositories.length === 0 && !error && (
          <div className="setup-alert setup-alert-warning"><AlertTriangle size={18} /><span>The App is not installed on any repository. Install it on at least one repository before continuing.</span></div>
        )}

        <a className="setup-install-link" href={installUrl} target="_blank" rel="noreferrer">Manage GitHub App installation <ArrowRight size={15} /></a>
      </div>
    </main>
  );
}
