import React, { useState } from "react";
import { 
  Sparkles, 
  Key, 
  Check, 
  ChevronRight, 
  ChevronLeft, 
  Lock, 
  Cpu, 
  ShieldAlert, 
  Globe,
  X 
} from "lucide-react";

export default function OnboardingOverlay({ authRequired, onComplete, errorMsg, settingsMode, onClose }) {
  // If settingsMode, we start directly on step 2
  const [step, setStep] = useState(settingsMode ? 2 : 1);
  const [credType, setCredType] = useState(
    localStorage.getItem("code_reviewer_cred_type") || "central"
  );
  
  // Custom credential states
  const [customGithubToken, setCustomGithubToken] = useState(
    localStorage.getItem("code_reviewer_github_token") || ""
  );
  const [customOpenRouterKey, setCustomOpenRouterKey] = useState(
    localStorage.getItem("code_reviewer_openrouter_key") || ""
  );
  
  // Access Key state
  const [accessKeyInput, setAccessKeyInput] = useState("");

  const handleNext = () => {
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      if (settingsMode) {
        handleSaveSettings();
      } else if (authRequired) {
        setStep(3);
      } else {
        handleFinish();
      }
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleSaveSettings = () => {
    if (credType === "custom") {
      localStorage.setItem("code_reviewer_github_token", customGithubToken.trim());
      localStorage.setItem("code_reviewer_openrouter_key", customOpenRouterKey.trim());
      localStorage.setItem("code_reviewer_cred_type", "custom");
    } else {
      localStorage.removeItem("code_reviewer_github_token");
      localStorage.removeItem("code_reviewer_openrouter_key");
      localStorage.setItem("code_reviewer_cred_type", "central");
    }
    if (onClose) onClose();
  };

  const handleFinish = (e) => {
    if (e) e.preventDefault();
    
    // Save credentials
    if (credType === "custom") {
      localStorage.setItem("code_reviewer_github_token", customGithubToken.trim());
      localStorage.setItem("code_reviewer_openrouter_key", customOpenRouterKey.trim());
      localStorage.setItem("code_reviewer_cred_type", "custom");
    } else {
      localStorage.removeItem("code_reviewer_github_token");
      localStorage.removeItem("code_reviewer_openrouter_key");
      localStorage.setItem("code_reviewer_cred_type", "central");
    }

    // Mark onboarding as complete
    localStorage.setItem("code_reviewer_onboarding_complete", "true");

    // Complete onboarding
    onComplete(accessKeyInput.trim());
  };

  const totalSteps = authRequired ? 3 : 2;

  return (
    <div className="auth-overlay">
      <div className="auth-modal onboarding-modal">
        {/* Cancel button if settingsMode */}
        {settingsMode && (
          <button onClick={onClose} className="onboarding-close-btn" title="Close Settings">
            <X size={18} />
          </button>
        )}

        {/* Stepper progress indicator (hidden in settings mode) */}
        {!settingsMode && (
          <div className="onboarding-stepper">
            {Array.from({ length: totalSteps }).map((_, idx) => (
              <div 
                key={idx} 
                className={`step-dot ${step === idx + 1 ? "active" : ""} ${step > idx + 1 ? "completed" : ""}`}
              />
            ))}
          </div>
        )}

        {/* Step 1: Welcome & Discover */}
        {step === 1 && !settingsMode && (
          <div className="onboarding-step-content animate-slide">
            <div className="onboarding-icon-wrapper">
              <Sparkles size={28} />
            </div>
            <h2 className="onboarding-title">Welcome to Code Reviewer</h2>
            <p className="onboarding-desc">
              AI-driven code reviews tailored directly to your team's coding rules. 
              Let's set up your workspace in just two minutes.
            </p>
            
            <div className="onboarding-features-list">
              <div className="onboarding-feature-item">
                <div className="feature-icon-bullet"><Check size={12} /></div>
                <div>
                  <h4>Audit Coding Guidelines</h4>
                  <p>Analyzes your pull requests for architectural and formatting compliance.</p>
                </div>
              </div>
              <div className="onboarding-feature-item">
                <div className="feature-icon-bullet"><Check size={12} /></div>
                <div>
                  <h4>Actionable Suggested Fixes</h4>
                  <p>Copy and apply code reviews instantly inside your editor.</p>
                </div>
              </div>
            </div>

            <button onClick={handleNext} className="btn btn-primary onboarding-next-btn">
              Get Started <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Step 2: Choose Configuration Type */}
        {step === 2 && (
          <div className="onboarding-step-content animate-slide">
            <div className="onboarding-icon-wrapper">
              <Cpu size={28} />
            </div>
            <h2 className="onboarding-title">
              {settingsMode ? "Workspace Settings" : "Choose Review Credentials"}
            </h2>
            <p className="onboarding-desc">
              Code Reviewer uses GitHub to fetch code and OpenRouter to analyze changes. Choose how you would like to run reviews:
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
                  <span className="form-help">Requires read-only repository permissions.</span>
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
                  <button onClick={handleBack} className="btn btn-secondary">
                    <ChevronLeft size={16} /> Back
                  </button>
                  <button onClick={handleNext} className="btn btn-primary">
                    {totalSteps === 2 ? "Finish" : "Next"} <ChevronRight size={16} />
                  </button>
                </>
              ) : (
                <>
                  <button onClick={onClose} className="btn btn-secondary" style={{ flex: 1 }}>
                    Cancel
                  </button>
                  <button onClick={handleSaveSettings} className="btn btn-primary" style={{ flex: 1 }}>
                    Save Settings <Check size={16} />
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Access control authentication */}
        {step === 3 && authRequired && !settingsMode && (
          <div className="onboarding-step-content animate-slide">
            <div className="onboarding-icon-wrapper">
              <Lock size={28} />
            </div>
            <h2 className="onboarding-title">Security Check</h2>
            <p className="onboarding-desc">
              This instance is secured. Please enter the App Access Key to initialize your workspace.
            </p>

            {errorMsg && (
              <div className="error-alert">
                <ShieldAlert size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleFinish} style={{ width: "100%", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div className="form-group" style={{ textAlign: "left" }}>
                <label className="form-label" htmlFor="onboarding-access-key">App Access Key</label>
                <input
                  id="onboarding-access-key"
                  type="password"
                  placeholder="Enter access key"
                  className="input-text"
                  value={accessKeyInput}
                  onChange={(e) => setAccessKeyInput(e.target.value)}
                  required
                />
              </div>

              <div className="onboarding-navigation">
                <button type="button" onClick={handleBack} className="btn btn-secondary">
                  <ChevronLeft size={16} /> Back
                </button>
                <button type="submit" className="btn btn-primary">
                  Complete Setup <Check size={16} />
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
