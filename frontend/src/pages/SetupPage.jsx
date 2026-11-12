import {
  CircleAlert,
  CircleCheck,
  ExternalLink,
  FolderGit2,
  Globe,
  LoaderCircle,
  Lock,
  LogOut,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import "../styles/app.css";
import Brand from "../components/Brand.jsx";
import SeverityTag from "../components/SeverityTag.jsx";
import { apiUrl, installUrl } from "../lib/config.js";
import { SEVERITIES } from "../lib/severity.js";

const severities = ["bug", "security", "style", "suggestion", "performance"];
const emptyRule = { id: "", rule: "", rationale: "", severity: "style" };
const TABS = [
  { id: "sources", label: "Convention sources" },
  { id: "rules", label: "Rules" },
];

async function readJson(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) throw new Error("The backend returned HTML instead of JSON. Check VITE_API_BASE_URL and redeploy the frontend.");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

/** Lowercased, sorted repository names, for comparing source lists regardless of order or casing. */
function sourceNames(sources) {
  return sources.map((source) => source.repository.toLowerCase()).sort();
}

function apiFetch(path, options = {}) {
  return fetch(apiUrl(path), { ...options, credentials: "include" });
}

function sendJson(path, method, body) {
  return apiFetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export default function SetupPage() {
  const [session, setSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [installationId, setInstallationId] = useState("");
  const [repositories, setRepositories] = useState([]);
  const [targetRepository, setTargetRepository] = useState("");
  const [sources, setSources] = useState([]);
  const [sourceInput, setSourceInput] = useState("");
  const [allowPublicSource, setAllowPublicSource] = useState(false);
  const [targetRules, setTargetRules] = useState([]);
  const [sourceRules, setSourceRules] = useState([]);
  const [effectiveRules, setEffectiveRules] = useState([]);
  const [ruleForm, setRuleForm] = useState(emptyRule);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(() => new URLSearchParams(window.location.search).get("auth_error") || "");
  const [saved, setSaved] = useState(false);
  const [savedSourceNames, setSavedSourceNames] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "rules" ? "rules" : "sources";

  useEffect(() => {
    apiFetch("/api/auth/me")
      .then((response) => (response.status === 401 ? null : readJson(response)))
      .then((data) => {
        if (!data?.authenticated) {
          setLoading(false);
          return;
        }
        setSession(data);
        const requested = Number(new URLSearchParams(window.location.search).get("installation_id"));
        const selected = data.installationIds.includes(requested) ? requested : data.installationIds[0];
        if (selected) setInstallationId(String(selected));
        else setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      })
      .finally(() => setAuthChecked(true));
  }, []);

  const loadRepository = useCallback(async (repository) => {
    if (!installationId || !repository) return;
    setError("");
    try {
      const query = `installation_id=${encodeURIComponent(installationId)}&repository=${encodeURIComponent(repository)}`;
      const setup = await readJson(await apiFetch(`/api/github/setup?${query}`));
      const configuredSources = setup.configuration?.conventionSources || [];
      setSources(configuredSources);
      setSavedSourceNames(sourceNames(configuredSources));
      setAllowPublicSource(configuredSources.some((source) => source.visibility === "public"));

      const rules = await readJson(await apiFetch(`/api/github/rules?${query}`));
      setTargetRules(rules.targetRules || []);
      setSourceRules(rules.sources || []);
      setEffectiveRules(rules.effectiveRules || []);
    } catch (err) {
      setError(err.message);
    }
  }, [installationId]);

  useEffect(() => {
    if (!installationId) return;
    apiFetch(`/api/github/setup?installation_id=${encodeURIComponent(installationId)}`)
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

  // Sources are only stored when "Save sources" is clicked; track edits made since the last load or save.
  const currentSourceNames = sourceNames(sources);
  const sourcesDirty =
    currentSourceNames.length !== savedSourceNames.length ||
    currentSourceNames.some((name, index) => name !== savedSourceNames[index]);

  useEffect(() => {
    if (!sourcesDirty) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [sourcesDirty]);

  function confirmDiscard() {
    return !sourcesDirty || window.confirm("You have unsaved changes to convention sources. Discard them?");
  }

  async function signOut() {
    if (!confirmDiscard()) return;
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } finally {
      setSession(null);
      setInstallationId("");
      setRepositories([]);
    }
  }

  function selectRepository(repository) {
    if (repository === targetRepository || !confirmDiscard()) return;
    setTargetRepository(repository);
    loadRepository(repository);
  }

  function selectTab(id) {
    setSearchParams((params) => {
      params.set("tab", id);
      return params;
    }, { replace: true });
  }

  function addSource(event) {
    event.preventDefault();
    const repository = sourceInput.trim();
    if (repository && !sources.some((source) => source.repository.toLowerCase() === repository.toLowerCase())) setSources([...sources, { repository, visibility: "installation" }]);
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
      await readJson(await sendJson("/api/github/setup", "POST", { installationId, repository: targetRepository, conventionSources: sources.map((source) => source.repository), allowPublicSource }));
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
      await readJson(await sendJson("/api/github/rules", method, { installationId, repository: targetRepository, ...ruleForm }));
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
      const response = await sendJson("/api/github/rules", "DELETE", { installationId, repository: targetRepository, id });
      if (response.status !== 204) await readJson(response);
      await loadRepository(targetRepository);
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleRule(rule) {
    try {
      // Learned rules are turned off for this repository only; custom rules are updated directly.
      const request = rule.kind === "custom"
        ? sendJson("/api/github/rules", "PATCH", { installationId, repository: targetRepository, id: rule.id, enabled: rule.enabled === false })
        : sendJson("/api/github/rules/learned", "PATCH", { installationId, repository: targetRepository, rule: rule.rule, enabled: rule.enabled === false });
      await readJson(await request);
      await loadRepository(targetRepository);
    } catch (err) {
      setError(err.message);
    }
  }

  const showWorkspace = !loading && session && installationId && repositories.length > 0;

  return (
    <div className="app">
      <header className="app-bar">
        <div className="app-bar-inner">
          <Brand size={28} />
          <span className="app-bar-title">Settings</span>
          <div className="app-bar-end">
            {session && session.installationIds.length > 1 && (
              <label className="app-bar-field">
                <span>Installation</span>
                <select value={installationId} onChange={(event) => { if (!confirmDiscard()) return; setLoading(true); setRepositories([]); setInstallationId(event.target.value); }}>
                  {session.installationIds.map((id) => <option key={id} value={String(id)}>Installation {id}</option>)}
                </select>
              </label>
            )}
            {session && <span className="app-bar-user">@{session.login}</span>}
            {session && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={signOut}>
                <LogOut size={16} aria-hidden="true" /> Sign out
              </button>
            )}
            <a className="btn btn-ghost btn-sm app-bar-manage" href={installUrl} target="_blank" rel="noreferrer">
              <span className="app-bar-manage-text">Manage GitHub App installation</span> <ExternalLink size={15} aria-hidden="true" />
            </a>
          </div>
        </div>
      </header>

      <main className="app-main">
        {error && (
          <div className="notice notice-error" role="alert">
            <CircleAlert size={18} aria-hidden="true" />
            <div>
              <p>{error}</p>
              {session && !showWorkspace && <p className="notice-hint">Choose another installation, or sign out and sign in again.</p>}
            </div>
          </div>
        )}

        {loading && <WorkspaceSkeleton label={session ? "Checking installed repositories…" : "Checking sign-in…"} />}

        {!loading && authChecked && !session && (
          <section className="gate" aria-labelledby="gate-title">
            <img src="/prhawk-mark.png" width="56" height="56" alt="" />
            <h1 id="gate-title">Sign in to PRHawk settings</h1>
            <p>Choose a target repository, add as many convention sources as you need, and manage custom rules.</p>
            <p>Sign in with the GitHub account that installed PRHawk to manage its settings.</p>
            <div className="gate-actions">
              <a className="btn btn-primary" href={apiUrl("/api/auth/github/login")}>Sign in with GitHub</a>
              <a className="btn btn-ghost" href={installUrl} target="_blank" rel="noreferrer">Install the App</a>
            </div>
          </section>
        )}

        {!loading && session && session.installationIds.length === 0 && (
          <section className="gate" aria-labelledby="empty-title">
            <h1 id="empty-title">No PRHawk installations yet</h1>
            <p>Your GitHub account has no PRHawk installations yet. Install the App first.</p>
            <div className="gate-actions">
              <a className="btn btn-primary" href={installUrl} target="_blank" rel="noreferrer">Install the App</a>
            </div>
          </section>
        )}

        {!loading && session && installationId && repositories.length === 0 && !error && (
          <section className="gate" aria-labelledby="norepo-title">
            <h1 id="norepo-title">No repositories in this installation</h1>
            <p>Give the App access to at least one repository, then reload this page.</p>
            <div className="gate-actions">
              <a className="btn btn-primary" href={installUrl} target="_blank" rel="noreferrer">Manage installation</a>
            </div>
          </section>
        )}

        {showWorkspace && (
          <div className="workspace">
            <aside className="repo-pane" aria-labelledby="repo-pane-title">
              <h2 id="repo-pane-title" className="pane-title">
                Repositories <span className="num">{repositories.length}</span>
              </h2>
              <label className="repo-select">
                <span className="visually-hidden">Repository to review</span>
                <select value={targetRepository} onChange={(event) => { if (!confirmDiscard()) return; setTargetRepository(event.target.value); loadRepository(event.target.value); }}>
                  {repositories.map((repository) => <option key={repository.fullName} value={repository.fullName}>{repository.fullName}</option>)}
                </select>
              </label>
              <ul className="repo-list">
                {repositories.map((repository) => (
                  <li key={repository.fullName}>
                    <button
                      type="button"
                      aria-current={repository.fullName === targetRepository ? "true" : undefined}
                      onClick={() => selectRepository(repository.fullName)}
                    >
                      {repository.private ? <Lock size={15} aria-hidden="true" /> : <FolderGit2 size={15} aria-hidden="true" />}
                      <span>{repository.fullName}</span>
                      {repository.private && <span className="tag">private</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </aside>

            <section className="repo-panel" aria-labelledby="repo-title">
              <div className="repo-head">
                <h1 id="repo-title">{targetRepository}</h1>
                <a href={`https://github.com/${targetRepository}`} target="_blank" rel="noreferrer">
                  Open on GitHub <ExternalLink size={14} aria-hidden="true" />
                </a>
              </div>

              <dl className="repo-stats">
                <div>
                  <dt>Rules applied to reviews</dt>
                  <dd className="num">{effectiveRules.length}</dd>
                </div>
                <div>
                  <dt>Convention sources</dt>
                  <dd className="num">{sources.length}</dd>
                </div>
                <div>
                  <dt>Custom rules</dt>
                  <dd className="num">{targetRules.filter((rule) => rule.kind === "custom").length}</dd>
                </div>
              </dl>

              <div className="tabs" role="tablist" aria-label="Repository settings">
                {TABS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    id={`tab-${item.id}`}
                    aria-selected={tab === item.id}
                    aria-controls={`panel-${item.id}`}
                    onClick={() => selectTab(item.id)}
                  >
                    {item.label}
                    {item.id === "sources" && sourcesDirty && <span className="tag tag-off">unsaved</span>}
                  </button>
                ))}
              </div>

              {tab === "sources" && (
                <div className="tab-panel" role="tabpanel" id="panel-sources" aria-labelledby="tab-sources">
                  <p className="panel-intro">Rules from these repositories are added to reviews for the selected target.</p>
                  <form className="field-row" onSubmit={addSource}>
                    <label className="visually-hidden" htmlFor="source-input">Source repository</label>
                    <input
                      id="source-input"
                      name="source"
                      autoComplete="off"
                      value={sourceInput}
                      onChange={(event) => setSourceInput(event.target.value)}
                      placeholder="owner/repository or GitHub URL"
                    />
                    <button className="btn btn-secondary" type="submit"><Plus size={16} aria-hidden="true" /> Add</button>
                  </form>

                  {sources.length === 0 ? (
                    <p className="empty-line">No external sources. The target repository&apos;s own merged PRs will be used.</p>
                  ) : (
                    <ul className="source-list">
                      {sources.map((source) => (
                        <li key={source.repository}>
                          {source.visibility === "public" ? <Globe size={16} aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}
                          <span className="source-name">{source.repository}</span>
                          <span className="tag">{source.visibility === "public" ? "public" : "installed"}</span>
                          <button type="button" className="icon-btn" onClick={() => removeSource(source.repository)} aria-label={`Remove ${source.repository}`}>
                            <X size={16} aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <label className="check">
                    <input type="checkbox" checked={allowPublicSource} onChange={(event) => setAllowPublicSource(event.target.checked)} />
                    <span>
                      Allow public repository sources
                      <small>Enable this for public sources such as <code>redis/redis</code>. Private sources still require the App.</small>
                    </span>
                  </label>

                  <div className="panel-actions">
                    <button className="btn btn-primary" type="button" onClick={saveSources} disabled={saving}>
                      {saving ? <LoaderCircle className="spin keep-motion" size={16} aria-hidden="true" /> : <CircleCheck size={16} aria-hidden="true" />}
                      {saving ? "Saving…" : "Save sources"}
                    </button>
                    <p className="status-line" role="status" data-tone={sourcesDirty ? "warning" : "success"}>
                      {sourcesDirty
                        ? "Unsaved changes. Click Save sources to keep them."
                        : saved && "Sources saved. Initial learning runs in the background."}
                    </p>
                  </div>
                </div>
              )}

              {tab === "rules" && (
                <RulesPanel
                  ruleForm={ruleForm}
                  setRuleForm={setRuleForm}
                  saveRule={saveRule}
                  saving={saving}
                  targetRules={targetRules}
                  sourceRules={sourceRules}
                  deleteRule={deleteRule}
                  toggleRule={toggleRule}
                />
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function WorkspaceSkeleton({ label }) {
  return (
    <div className="workspace skeleton" aria-busy="true">
      <div className="repo-pane">
        <span className="sk sk-title" />
        <span className="sk sk-row" />
        <span className="sk sk-row" />
        <span className="sk sk-row" />
      </div>
      <div className="repo-panel">
        <p className="skeleton-label" role="status">
          <LoaderCircle className="spin keep-motion" size={18} aria-hidden="true" /> {label}
        </p>
        <span className="sk sk-head" />
        <span className="sk sk-block" />
      </div>
    </div>
  );
}

function RulesPanel({ ruleForm, setRuleForm, saveRule, saving, targetRules, sourceRules, deleteRule, toggleRule }) {
  const [filter, setFilter] = useState("all");
  const ruleInput = useRef(null);
  const matches = (rule) => filter === "all" || rule.severity === filter;
  const total = targetRules.length + sourceRules.reduce((sum, source) => sum + source.rules.length, 0);
  const presentSeverities = useMemo(() => {
    const present = new Set([...targetRules, ...sourceRules.flatMap((source) => source.rules)].map((rule) => rule.severity));
    const counts = new Map();
    for (const rule of [...targetRules, ...sourceRules.flatMap((source) => source.rules)]) counts.set(rule.severity, (counts.get(rule.severity) ?? 0) + 1);
    return SEVERITIES.filter((severity) => present.has(severity.id)).map((severity) => ({ ...severity, count: counts.get(severity.id) }));
  }, [targetRules, sourceRules]);

  useEffect(() => {
    if (ruleForm.id) ruleInput.current?.focus();
  }, [ruleForm.id]);

  return (
    <div className="tab-panel" role="tabpanel" id="panel-rules" aria-labelledby="tab-rules">
      <p className="panel-intro">Learned rules can be disabled for this repository; other repositories using the same source are not affected. Custom rules can be added, edited, disabled, or deleted.</p>

      <form className="rule-form" onSubmit={saveRule}>
        <p className="rule-form-title">{ruleForm.id ? "Edit custom rule" : "Add a custom rule"}</p>
        <label>
          <span>Rule</span>
          <input ref={ruleInput} name="rule" autoComplete="off" value={ruleForm.rule} onChange={(event) => setRuleForm({ ...ruleForm, rule: event.target.value })} placeholder="Rule, for example: Validate API input" required />
        </label>
        <label>
          <span>Why it matters</span>
          <input name="rationale" autoComplete="off" value={ruleForm.rationale} onChange={(event) => setRuleForm({ ...ruleForm, rationale: event.target.value })} placeholder="Why this rule matters" required />
        </label>
        <label>
          <span>Severity</span>
          <select name="severity" value={ruleForm.severity} onChange={(event) => setRuleForm({ ...ruleForm, severity: event.target.value })}>
            {severities.map((severity) => <option key={severity}>{severity}</option>)}
          </select>
        </label>
        <div className="rule-form-actions">
          <button className="btn btn-primary" type="submit" disabled={saving}>{ruleForm.id ? "Update rule" : "Add custom rule"}</button>
          {ruleForm.id && <button className="btn btn-ghost" type="button" onClick={() => setRuleForm(emptyRule)}>Cancel</button>}
        </div>
      </form>

      {total > 0 && presentSeverities.length > 1 && (
        <div className="segmented" role="group" aria-label="Filter rules by severity">
          <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All <span className="num">{total}</span></button>
          {presentSeverities.map((severity) => (
            <button key={severity.id} type="button" aria-pressed={filter === severity.id} onClick={() => setFilter(severity.id)}>{severity.label} <span className="num">{severity.count}</span></button>
          ))}
        </div>
      )}

      <div className="rule-group">
        <h3>Target repository rules</h3>
        {targetRules.length === 0 ? (
          <p className="empty-line">No learned or custom rules yet. PRHawk learns rules after you save sources and when pull requests merge.</p>
        ) : (
          <ul className="rule-list">
            {targetRules.filter(matches).map((rule) => (
              <RuleRow key={rule.id || rule.rule} rule={rule} onEdit={() => rule.kind === "custom" && setRuleForm(rule)} onDelete={() => rule.kind === "custom" && deleteRule(rule.id)} onToggle={() => toggleRule(rule)} />
            ))}
          </ul>
        )}
      </div>

      {sourceRules.map((source) => (
        <div className="rule-group" key={source.repository}>
          <h3>
            {source.repository} <span className="tag">{source.visibility}</span>
          </h3>
          {source.rules.length === 0 ? (
            <p className="empty-line">No learned rules yet.</p>
          ) : (
            <ul className="rule-list">
              {source.rules.filter(matches).map((rule) => <RuleRow key={`${source.repository}-${rule.id || rule.rule}`} rule={rule} onToggle={() => toggleRule(rule)} />)}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function RuleRow({ rule, onEdit, onDelete, onToggle }) {
  const custom = rule.kind === "custom";
  const disabled = rule.enabled === false;
  return (
    <li className={`rule-row${disabled ? " is-disabled" : ""}`}>
      <SeverityTag severity={rule.severity} />
      <div className="rule-body">
        <p className="rule-text">{rule.rule}</p>
        <p className="rule-rationale">{rule.rationale}</p>
        <p className="rule-meta">
          <span className="tag">{custom ? "custom" : rule.kind || "learned"}</span>
          {disabled && <span className="tag tag-off">disabled</span>}
        </p>
      </div>
      {onToggle && (
        <div className="rule-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onToggle}>
            {disabled ? <Power size={15} aria-hidden="true" /> : <PowerOff size={15} aria-hidden="true" />}
            {disabled ? "Enable" : "Disable"}
          </button>
          {custom && (
            <>
              <button type="button" className="icon-btn" onClick={onEdit} aria-label="Edit rule"><Pencil size={15} aria-hidden="true" /></button>
              <button type="button" className="icon-btn icon-btn-danger" onClick={onDelete} aria-label="Delete rule"><Trash2 size={15} aria-hidden="true" /></button>
            </>
          )}
        </div>
      )}
    </li>
  );
}
