import React, { useState, useEffect } from "react";
import { 
  BookOpen, 
  Sparkles, 
  Trash2, 
  Edit3, 
  Plus, 
  Save, 
  X, 
  AlertTriangle,
  Info,
  Search,
  Check
} from "lucide-react";

export default function RulesTab({ accessKey, addToast }) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [learning, setLearning] = useState(false);
  const [repoInput, setRepoInput] = useState("");
  
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");

  // Custom rule creation form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRule, setNewRule] = useState("");
  const [newRationale, setNewRationale] = useState("");
  const [newSeverity, setNewSeverity] = useState("suggestion");

  // Editing state
  const [editingIndex, setEditingIndex] = useState(null);
  const [editRule, setEditRule] = useState("");
  const [editRationale, setEditRationale] = useState("");
  const [editSeverity, setEditSeverity] = useState("suggestion");

  // Load conventions on component mount
  useEffect(() => {
    fetchConventions();
  }, []);

  const fetchConventions = async () => {
    setLoading(true);
    try {
      const customGithubToken = localStorage.getItem("code_reviewer_github_token") || "";
      const customOpenRouterKey = localStorage.getItem("code_reviewer_openrouter_key") || "";

      const response = await fetch("/api/conventions", {
        headers: {
          ...(accessKey ? { "x-access-key": accessKey } : {}),
          ...(customGithubToken ? { "x-github-token": customGithubToken } : {}),
          ...(customOpenRouterKey ? { "x-openrouter-key": customOpenRouterKey } : {})
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to load rules");
      }
      setRules(data.rules || []);
    } catch (err) {
      console.error(err);
      addToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleLearn = async (e) => {
    e.preventDefault();
    if (!repoInput.trim()) {
      addToast("Please enter a repository name or URL.", "error");
      return;
    }

    setLearning(true);
    try {
      const customGithubToken = localStorage.getItem("code_reviewer_github_token") || "";
      const customOpenRouterKey = localStorage.getItem("code_reviewer_openrouter_key") || "";

      const response = await fetch("/api/learn", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessKey ? { "x-access-key": accessKey } : {}),
          ...(customGithubToken ? { "x-github-token": customGithubToken } : {}),
          ...(customOpenRouterKey ? { "x-openrouter-key": customOpenRouterKey } : {})
        },
        body: JSON.stringify({ repo: repoInput.trim() })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to learn conventions");
      }

      setRules(data.rules || []);
      setRepoInput("");
      addToast(`Learned ${data.rules?.length || 0} conventions!`, "success");
    } catch (err) {
      console.error(err);
      addToast(err.message, "error");
    } finally {
      setLearning(false);
    }
  };

  const saveRulesToServer = async (updatedRules) => {
    try {
      const customGithubToken = localStorage.getItem("code_reviewer_github_token") || "";
      const customOpenRouterKey = localStorage.getItem("code_reviewer_openrouter_key") || "";

      const response = await fetch("/api/conventions", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(accessKey ? { "x-access-key": accessKey } : {}),
          ...(customGithubToken ? { "x-github-token": customGithubToken } : {}),
          ...(customOpenRouterKey ? { "x-openrouter-key": customOpenRouterKey } : {})
        },
        body: JSON.stringify({ rules: updatedRules })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to save conventions");
      }
      
      setRules(updatedRules);
      return true;
    } catch (err) {
      console.error(err);
      addToast(err.message, "error");
      return false;
    }
  };

  const handleAddRule = async (e) => {
    e.preventDefault();
    if (!newRule.trim() || !newRationale.trim()) {
      addToast("Please fill out both the rule description and rationale.", "error");
      return;
    }

    const updatedRules = [
      ...rules,
      {
        rule: newRule.trim(),
        rationale: newRationale.trim(),
        severity: newSeverity
      }
    ];

    const success = await saveRulesToServer(updatedRules);
    if (success) {
      setNewRule("");
      setNewRationale("");
      setNewSeverity("suggestion");
      setShowAddForm(false);
      addToast("Custom rule added!", "success");
    }
  };

  const handleDeleteRule = async (indexToDelete) => {
    if (!window.confirm("Are you sure you want to delete this convention rule?")) {
      return;
    }

    const updatedRules = rules.filter((_, idx) => idx !== indexToDelete);
    const success = await saveRulesToServer(updatedRules);
    if (success) {
      addToast("Rule deleted.", "success");
    }
  };

  const startEdit = (index) => {
    const ruleObj = rules[index];
    setEditingIndex(index);
    setEditRule(ruleObj.rule);
    setEditRationale(ruleObj.rationale);
    setEditSeverity(ruleObj.severity);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
  };

  const handleSaveEdit = async (index) => {
    if (!editRule.trim() || !editRationale.trim()) {
      addToast("Please fill out both the rule description and rationale.", "error");
      return;
    }

    const updatedRules = rules.map((r, idx) => {
      if (idx === index) {
        return {
          rule: editRule.trim(),
          rationale: editRationale.trim(),
          severity: editSeverity
        };
      }
      return r;
    });

    const success = await saveRulesToServer(updatedRules);
    if (success) {
      setEditingIndex(null);
      addToast("Rule updated successfully!", "success");
    }
  };

  // Filter and search rules list
  const filteredRules = rules.filter(r => {
    const matchesQuery = r.rule.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         r.rationale.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSeverity = severityFilter === "all" || r.severity === severityFilter;
    return matchesQuery && matchesSeverity;
  });

  return (
    <div className="rules-container">
      {/* Left Column: Rules Manager */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        
        {/* Rules Search & Filter */}
        <div className="card" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ position: "relative", flex: 1, minWidth: "200px" }}>
              <input
                type="text"
                placeholder="Search rules or rationales..."
                className="input-text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingRight: "2.5rem" }}
              />
              <Search size={18} style={{ position: "absolute", right: "1rem", top: "50%", transform: "translateY(-50%)", color: "var(--t3)" }} />
            </div>
            
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <select 
                className="select-dropdown" 
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                style={{ padding: "0.5rem 2rem 0.5rem 1rem", fontSize: "0.85rem", width: "150px" }}
              >
                <option value="all">All Severities</option>
                <option value="bug">Bugs</option>
                <option value="security">Security</option>
                <option value="performance">Performance</option>
                <option value="style">Style</option>
                <option value="suggestion">Suggestion</option>
              </select>
              
              {!showAddForm && (
                <button 
                  onClick={() => setShowAddForm(true)} 
                  className="btn btn-primary"
                  style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}
                >
                  <Plus size={16} /> Add Custom
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Add custom rule form overlay inside list */}
        {showAddForm && (
          <div className="card" style={{ border: "2px dashed var(--border-focus)", backgroundColor: "var(--surface-hover)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: "700" }}>Add New Convention Rule</h3>
              <button onClick={() => setShowAddForm(false)} className="icon-btn" style={{ width: "32px", height: "32px" }}>
                <X size={16} />
              </button>
            </div>
            
            <form onSubmit={handleAddRule} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="form-group">
                <label className="form-label">Rule Description</label>
                <input
                  type="text"
                  placeholder="e.g. Always check if index is out of bounds in critical loops"
                  className="input-text"
                  value={newRule}
                  onChange={(e) => setNewRule(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Rationale / Evidence</label>
                <textarea
                  placeholder="e.g. History shows 3 production crashes due to index out of bounds in loop.ts"
                  className="input-textarea"
                  value={newRationale}
                  onChange={(e) => setNewRationale(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Severity</label>
                <select 
                  className="select-dropdown"
                  value={newSeverity}
                  onChange={(e) => setNewSeverity(e.target.value)}
                >
                  <option value="bug">Bug</option>
                  <option value="security">Security</option>
                  <option value="performance">Performance</option>
                  <option value="style">Style</option>
                  <option value="suggestion">Suggestion</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setShowAddForm(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Custom Rule
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Rules List */}
        <div className="rules-list">
          {loading && (
            <div className="empty-state">
              <div className="loader-spinner" style={{ width: "30px", height: "30px" }}></div>
              <div className="empty-state-title">Loading Conventions...</div>
            </div>
          )}

          {!loading && filteredRules.length === 0 && (
            <div className="empty-state">
              <BookOpen size={40} className="empty-state-icon" />
              <div className="empty-state-title">No Rules Configured</div>
              <div className="empty-state-desc">
                {searchQuery || severityFilter !== "all" 
                  ? "No conventions match your search criteria." 
                  : "Start by learning conventions from a github repository using the panel on the right, or add a custom rule manually."
                }
              </div>
            </div>
          )}

          {!loading && filteredRules.map((ruleObj, idx) => {
            // Find global index of this rule in the main rules array
            const globalIndex = rules.indexOf(ruleObj);
            const isEditing = editingIndex === globalIndex;

            if (isEditing) {
              return (
                <div key={globalIndex} className="card" style={{ borderColor: "var(--border-focus)" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <div className="form-group">
                      <label className="form-label">Rule Description</label>
                      <input
                        type="text"
                        className="input-text"
                        value={editRule}
                        onChange={(e) => setEditRule(e.target.value)}
                      />
                    </div>
                    
                    <div className="form-group">
                      <label className="form-label">Rationale</label>
                      <textarea
                        className="input-textarea"
                        value={editRationale}
                        onChange={(e) => setEditRationale(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Severity</label>
                      <select
                        className="select-dropdown"
                        value={editSeverity}
                        onChange={(e) => setEditSeverity(e.target.value)}
                      >
                        <option value="bug">Bug</option>
                        <option value="security">Security</option>
                        <option value="performance">Performance</option>
                        <option value="style">Style</option>
                        <option value="suggestion">Suggestion</option>
                      </select>
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                      <button onClick={cancelEdit} className="btn btn-secondary" style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}>
                        <X size={14} /> Cancel
                      </button>
                      <button onClick={() => handleSaveEdit(globalIndex)} className="btn btn-primary" style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}>
                        <Save size={14} /> Save Changes
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={globalIndex} className="card rule-item-card">
                <div className="rule-header">
                  <span className={`badge badge-${ruleObj.severity}`}>{ruleObj.severity}</span>
                  <div className="rule-actions">
                    <button 
                      onClick={() => startEdit(globalIndex)} 
                      className="icon-btn" 
                      style={{ width: "32px", height: "32px" }}
                      title="Edit rule"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button 
                      onClick={() => handleDeleteRule(globalIndex)} 
                      className="icon-btn" 
                      style={{ width: "32px", height: "32px" }}
                      title="Delete rule"
                    >
                      <Trash2 size={14} style={{ color: "var(--color-bug)" }} />
                    </button>
                  </div>
                </div>

                <div className="rule-text">{ruleObj.rule}</div>
                <div className="rule-rationale-box">
                  <strong style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--t3)", display: "block", marginBottom: "0.25rem" }}>Rationale</strong>
                  {ruleObj.rationale}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Column: Learn Conventions Panel */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <div className="card">
          <div className="card-title">
            <Sparkles size={20} style={{ color: "var(--terra)" }} />
            Learn Conventions
          </div>
          <p className="card-desc">
            Analyze historical merged pull requests in a Git repository to automatically discover coding conventions.
          </p>

          <form onSubmit={handleLearn} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div className="form-group">
              <label className="form-label" htmlFor="repo-learn">GitHub Repository</label>
              <input
                id="repo-learn"
                type="text"
                className="input-text"
                placeholder="e.g. facebook/react or full Github URL"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                disabled={learning}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={learning}>
              {learning ? (
                <>
                  <div className="loader-spinner" style={{ width: "16px", height: "16px", borderThickness: "2px", marginRight: "0.5rem" }}></div>
                  Learning from PRs...
                </>
              ) : (
                <>
                  <Sparkles size={16} /> Learn from Git History
                </>
              )}
            </button>
          </form>

          <div style={{ marginTop: "1.5rem", padding: "1rem", backgroundColor: "var(--surface-alt)", borderRadius: "var(--r-md)", border: "1px solid var(--border)", display: "flex", gap: "0.75rem" }}>
            <Info size={20} style={{ color: "var(--terra)", flexShrink: 0, marginTop: "2px" }} />
            <div style={{ fontSize: "0.85rem", color: "var(--t2)" }}>
              PRHawk pulls the last 10 merged pull requests, extracts changes, and prompts AI to catalog repeated patterns.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
