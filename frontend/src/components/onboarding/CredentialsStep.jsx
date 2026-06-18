import { Cpu, Globe, Key, Check, ChevronRight, ChevronLeft } from "lucide-react";

export default function CredentialsStep({
  settingsMode,
  credType,
  setCredType,
  customGithubToken,
  setCustomGithubToken,
  customOpenRouterKey,
  setCustomOpenRouterKey,
  totalSteps,
  onNext,
  onBack,
  onSaveSettings,
  onClose,
}) {
  return (
    <div className="onboarding-step-content animate-slide">
      <div className="onboarding-icon-wrapper">
        <Cpu size={28} />
      </div>
      <h2 className="onboarding-title">
        {settingsMode ? "Workspace Settings" : "Choose Review Credentials"}
      </h2>
      <p className="onboarding-desc">
        PRHawk uses GitHub to fetch code and OpenRouter to analyze changes. Choose how you would like to run reviews:
      </p>

      <div className="cred-options-grid">
        <div
          className={`cred-option-card ${credType === "central" ? "active" : ""}`}
          onClick={() => setCredType("central")}
        >
          <div className="cred-card-header">
            <Globe size={18} />
            <span>Central Server Credentials (Default)</span>
          </div>
          <p>Zero configuration required. Uses the server-defined GitHub token and LLM keys.</p>
        </div>

        <div
          className={`cred-option-card ${credType === "custom" ? "active" : ""}`}
          onClick={() => setCredType("custom")}
        >
          <div className="cred-card-header">
            <Key size={18} />
            <span>Provide Personal Custom Keys</span>
          </div>
          <p>Enter your own keys to bypass server rate limits, review private repos, or use your own billing.</p>
        </div>
      </div>

      {credType === "custom" && (
        <div className="custom-keys-inputs animate-fade-in">
          <div className="form-group" style={{ textAlign: "left" }}>
            <label className="form-label" htmlFor="custom-gh-token">GitHub Classic Token (Optional)</label>
            <input
              id="custom-gh-token"
              type="password"
              placeholder="ghp_..."
              className="input-text"
              value={customGithubToken}
              onChange={(e) => setCustomGithubToken(e.target.value)}
            />
            <span className="form-help">Needs permission to post PR reviews: classic token with the <code>repo</code> scope (or <code>public_repo</code> for public repos), and the account must have access to the reviewed repository.</span>
          </div>

          <div className="form-group" style={{ textAlign: "left" }}>
            <label className="form-label" htmlFor="custom-or-key">OpenRouter API Key (Optional)</label>
            <input
              id="custom-or-key"
              type="password"
              placeholder="sk-or-..."
              className="input-text"
              value={customOpenRouterKey}
              onChange={(e) => setCustomOpenRouterKey(e.target.value)}
            />
            <span className="form-help">Uses Llama 3.3 70B by default if central model is active.</span>
          </div>
        </div>
      )}

      <div className="onboarding-navigation">
        {!settingsMode ? (
          <>
            <button onClick={onBack} className="btn btn-secondary">
              <ChevronLeft size={16} /> Back
            </button>
            <button onClick={onNext} className="btn btn-primary">
              {totalSteps === 2 ? "Finish" : "Next"} <ChevronRight size={16} />
            </button>
          </>
        ) : (
          <>
            <button onClick={onClose} className="btn btn-secondary" style={{ flex: 1 }}>
              Cancel
            </button>
            <button onClick={onSaveSettings} className="btn btn-primary" style={{ flex: 1 }}>
              Save Settings <Check size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
