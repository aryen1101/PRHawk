import { AlertTriangle, ArrowRight, CheckCircle, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const installUrl = import.meta.env.VITE_GITHUB_APP_INSTALL_URL || "https://github.com/apps/prhawk-webhook-tester/installations/new";
const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const apiUrl = (path) => `${apiBase}${path}`;
const severities = ["bug", "security", "style", "suggestion", "performance"];
const emptyRule = { id: "", rule: "", rationale: "", severity: "style" };

async function readJson(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) throw new Error("The backend returned HTML instead of JSON. Check VITE_API_BASE_URL and redeploy the frontend.");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

export default function SetupPage() {
  const installationId = new URLSearchParams(window.location.search).get("installation_id");
  const [repositories, setRepositories] = useState([]);
  const [targetRepository, setTargetRepository] = useState("");
  const [sources, setSources] = useState([]);
  const [sourceInput, setSourceInput] = useState("");
  const [allowPublicSource, setAllowPublicSource] = useState(false);
  const [targetRules, setTargetRules] = useState([]);
  const [sourceRules, setSourceRules] = useState([]);
  const [ruleForm, setRuleForm] = useState(emptyRule);
  const [loading, setLoading] = useState(Boolean(installationId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const loadRepository = useCallback(async (repository) => {
    if (!installationId || !repository) return;
    setError("");
    try {
      const setupResponse = await fetch(apiUrl(`/api/github/setup?installation_id=${encodeURIComponent(installationId)}&repository=${encodeURIComponent(repository)}`));
      const setup = await readJson(setupResponse);
      const configuredSources = setup.configuration?.conventionSources || [];
      setSources(configuredSources);
      setAllowPublicSource(configuredSources.some((source) => source.visibility === "public"));

      const rulesResponse = await fetch(apiUrl(`/api/github/rules?installation_id=${encodeURIComponent(installationId)}&repository=${encodeURIComponent(repository)}`));
      const rules = await readJson(rulesResponse);
      setTargetRules(rules.targetRules || []);
      setSourceRules(rules.sources || []);
    } catch (err) {
      setError(err.message);
    }
  }, [installationId]);

  useEffect(() => {
    if (!installationId) return;
    fetch(apiUrl(`/api/github/setup?installation_id=${encodeURIComponent(installationId)}`))
      .then(readJson)
      .then((data) => {
        setRepositories(data.repositories || []);
        const first = data.repositories?.[0]?.fullName || "";
        setTargetRepository(first);
        return loadRepository(first);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [installationId, loadRepository]);

  function addSource(event) {
    event.preventDefault();
    const repository = sourceInput.trim();
    if (repository && !sources.some((source) => source.repository === repository)) setSources([...sources, { repository, visibility: "installation" }]);
    setSourceInput("");
  }

  function removeSource(repository) {
    setSources(sources.filter((source) => source.repository !== repository));
  }

  async function saveSources(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await readJson(await fetch(apiUrl("/api/github/setup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installationId, repository: targetRepository, conventionSources: sources.map((source) => source.repository), allowPublicSource }),
      }));
      setSaved(true);
      await loadRepository(targetRepository);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveRule(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const method = ruleForm.id ? "PATCH" : "POST";
      await readJson(await fetch(apiUrl("/api/github/rules"), {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installationId, repository: targetRepository, ...ruleForm }),
      }));
      setRuleForm(emptyRule);
      await loadRepository(targetRepository);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteRule(id) {
    if (!window.confirm("Delete this custom rule?")) return;
    try {
      await readJson(await fetch(apiUrl("/api/github/rules"), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installationId, repository: targetRepository, id }),
      }));
      await loadRepository(targetRepository);
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleRule(rule) {
    try {
      await readJson(await fetch(apiUrl("/api/github/rules"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installationId, repository: targetRepository, id: rule.id, enabled: rule.enabled === false }),
      }));
      await loadRepository(targetRepository);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="setup-page">
      <div className="setup-card setup-card-wide">
        <a className="setup-brand" href="/">PR<span>Hawk</span>.</a>
        <div className="landing-kicker"><span /> GitHub App setup</div>
        <h1>Configure repository conventions</h1>
        <p className="setup-copy">Choose a target repository, add as many convention sources as you need, and manage custom rules.</p>
        {!installationId && <div className="setup-alert setup-alert-warning"><AlertTriangle size={18} /><span>Open this page from the GitHub App installation flow.</span></div>}
        {loading && <div className="setup-loading"><LoaderCircle className="spin" size={18} /> Checking installed repositories…</div>}
        {error && <div className="setup-alert setup-alert-error"><AlertTriangle size={18} /><span>{error}</span></div>}

        {!loading && installationId && repositories.length > 0 && <>
          <label className="setup-field">
            Repository to review
            <select value={targetRepository} onChange={(event) => { setTargetRepository(event.target.value); loadRepository(event.target.value); }}>
              {repositories.map((repository) => <option key={repository.fullName} value={repository.fullName}>{repository.fullName}</option>)}
            </select>
          </label>

          <section className="setup-section">
            <div className="setup-section-heading"><div><h2>Convention sources</h2><p>Rules from these repositories are added to reviews for the selected target.</p></div></div>
            <form className="setup-add-row" onSubmit={addSource}><input value={sourceInput} onChange={(event) => setSourceInput(event.target.value)} placeholder="owner/repository or GitHub URL" /><button className="btn btn-secondary" type="submit"><Plus size={16} /> Add</button></form>
            {sources.length === 0 && <p className="setup-muted">No external sources. The target repository&apos;s own merged PRs will be used.</p>}
            {sources.map((source) => <div className="setup-list-row" key={source.repository}><span>{source.repository} {source.visibility === "public" && <em>public</em>}</span><button type="button" className="icon-button" onClick={() => removeSource(source.repository)} aria-label={`Remove ${source.repository}`}><X size={16} /></button></div>)}
            <label className="setup-checkbox"><input type="checkbox" checked={allowPublicSource} onChange={(event) => setAllowPublicSource(event.target.checked)} /><span>Allow public repository sources</span></label>
            <small className="setup-public-note">Enable this for public sources such as <code>redis/redis</code>. Private sources still require the App.</small>
            <button className="btn btn-primary setup-submit" type="button" onClick={saveSources} disabled={saving}><CheckCircle size={16} /> Save sources</button>
            {saved && <div className="setup-alert setup-alert-success"><CheckCircle size={18} /><span>Sources saved. Initial learning runs in the background.</span></div>}
          </section>

          <section className="setup-section">
            <div className="setup-section-heading"><div><h2>Rules</h2><p>Learned rules are read-only. Custom rules can be added, edited, disabled, or deleted.</p></div></div>
            <form className="setup-rule-form" onSubmit={saveRule}><input value={ruleForm.rule} onChange={(event) => setRuleForm({ ...ruleForm, rule: event.target.value })} placeholder="Rule, for example: Validate API input" required /><input value={ruleForm.rationale} onChange={(event) => setRuleForm({ ...ruleForm, rationale: event.target.value })} placeholder="Why this rule matters" required /><select value={ruleForm.severity} onChange={(event) => setRuleForm({ ...ruleForm, severity: event.target.value })}>{severities.map((severity) => <option key={severity}>{severity}</option>)}</select><button className="btn btn-primary" type="submit" disabled={saving}>{ruleForm.id ? "Update rule" : "Add custom rule"}</button>{ruleForm.id && <button className="btn btn-secondary" type="button" onClick={() => setRuleForm(emptyRule)}>Cancel</button>}</form>
            <div className="setup-rule-groups">
              <h3>Target repository rules</h3>
              {targetRules.length === 0 && <p className="setup-muted">No learned or custom rules yet.</p>}
              {targetRules.map((rule) => <RuleRow key={rule.id || rule.rule} rule={rule} onEdit={() => rule.kind === "custom" && setRuleForm(rule)} onDelete={() => rule.kind === "custom" && deleteRule(rule.id)} onToggle={() => rule.kind === "custom" && toggleRule(rule)} />)}
              {sourceRules.map((source) => <div key={source.repository}><h3>{source.repository} <span className="setup-rule-source">{source.visibility}</span></h3>{source.rules.length === 0 ? <p className="setup-muted">No learned rules yet.</p> : source.rules.map((rule) => <RuleRow key={`${source.repository}-${rule.id || rule.rule}`} rule={rule} />)}</div>)}
            </div>
          </section>
        </>}
        <a className="setup-install-link" href={installUrl} target="_blank" rel="noreferrer">Manage GitHub App installation <ArrowRight size={15} /></a>
      </div>
    </main>
  );
}

function RuleRow({ rule, onEdit, onDelete, onToggle }) {
  return <div className={`setup-rule-row ${rule.enabled === false ? "is-disabled" : ""}`}><div><strong>{rule.rule}</strong><p>{rule.rationale}</p><small>{rule.severity} · {rule.kind || "learned"}</small></div>{rule.kind === "custom" && <div className="setup-rule-actions"><button type="button" className="icon-button" onClick={onToggle}>{rule.enabled === false ? "Enable" : "Disable"}</button><button type="button" className="icon-button" onClick={onEdit} aria-label="Edit rule"><Pencil size={15} /></button><button type="button" className="icon-button" onClick={onDelete} aria-label="Delete rule"><Trash2 size={15} /></button></div>}</div>;
}
