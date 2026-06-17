import React, { useState, useEffect } from "react";
import { 
  GitPullRequest, 
  BookOpen, 
  LogOut, 
  Lock, 
  ShieldCheck, 
  Info,
  CheckCircle,
  XCircle,
  HelpCircle,
  Settings
} from "lucide-react";
import ReviewTab from "./components/ReviewTab";
import RulesTab from "./components/RulesTab";
import OnboardingOverlay from "./components/OnboardingOverlay";

export default function App() {
  // Authentication & Onboarding states
  const [authRequired, setAuthRequired] = useState(false);
  const [accessKey, setAccessKey] = useState(localStorage.getItem("prhawk_access_key") || "");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  
  // Onboarding state
  const [onboardingComplete, setOnboardingComplete] = useState(
    localStorage.getItem("code_reviewer_onboarding_complete") === "true"
  );
  
  // Settings modal state
  const [showSettings, setShowSettings] = useState(false);

  // Layout states
  const [activeTab, setActiveTab] = useState("review");
  
  // Toast notifications state
  const [toasts, setToasts] = useState([]);

  // Toast utility
  const addToast = (message, type = "info") => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Check auth status on startup
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const res = await fetch("/api/auth-required");
        const data = await res.json();
        setAuthRequired(data.authRequired);
        
        if (data.authRequired && accessKey) {
          // Verify saved key by trying to fetch conventions
          const testRes = await fetch("/api/conventions", {
            headers: { "x-access-key": accessKey }
          });
          if (testRes.status === 401) {
            setAuthError("Saved access key is invalid. Please log in again.");
            setAccessKey("");
            localStorage.removeItem("prhawk_access_key");
            setOnboardingComplete(false); // Force re-auth/onboarding
          }
        }
      } catch (err) {
        console.error("Auth check failed:", err);
        addToast("Error checking authentication status.", "error");
      } finally {
        setAuthLoading(false);
      }
    };
    
    checkAuthStatus();
  }, [accessKey]);

  // Ensure dark mode is always disabled since the dark mode feature is removed
  useEffect(() => {
    document.body.classList.remove("dark");
    localStorage.removeItem("prhawk_theme");
  }, []);

  const handleCompleteOnboarding = async (key) => {
    setAuthError("");
    if (authRequired) {
      if (!key) {
        setAuthError("Access key is required.");
        return;
      }
      
      try {
        // Test the input key
        const res = await fetch("/api/conventions", {
          headers: { "x-access-key": key }
        });

        if (res.status === 401) {
          setAuthError("Access key is invalid. Please try again.");
          return;
        }
        
        localStorage.setItem("prhawk_access_key", key);
        setAccessKey(key);
      } catch (err) {
        setAuthError("Failed to verify access key. Is the server running?");
        return;
      }
    }
    
    setOnboardingComplete(true);
    addToast("Setup completed successfully!", "success");
  };

  const handleLogout = () => {
    localStorage.removeItem("prhawk_access_key");
    localStorage.removeItem("code_reviewer_onboarding_complete");
    setAccessKey("");
    setOnboardingComplete(false);
    addToast("Logged out successfully.", "success");
  };

  // Show loading spinner if checking auth status
  if (authLoading) {
    return (
      <div style={{ display: "flex", width: "100vw", height: "100vh", alignItems: "center", justifyContent: "center", backgroundColor: "var(--bg)" }}>
        <div className="loader-spinner"></div>
      </div>
    );
  }

  // Display onboarding wizard on first visit, or settings override
  const showOnboarding = !onboardingComplete || (authRequired && !accessKey);

  return (
    <div className="app-container">
      {showOnboarding && (
        <OnboardingOverlay 
          authRequired={authRequired} 
          onComplete={handleCompleteOnboarding} 
          errorMsg={authError} 
        />
      )}

      {showSettings && (
        <OnboardingOverlay
          settingsMode={true}
          onClose={() => {
            setShowSettings(false);
            addToast("Settings updated!", "success");
          }}
        />
      )}

      {/* Header */}
      <header className="app-header">
        <div className="brand" onClick={() => setActiveTab("review")}>
          <div className="brand-logo-mark">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 2L30 16L16 30L2 16L16 2Z" stroke="var(--terra)" strokeWidth="2.5" strokeLinejoin="round"/>
              <path d="M16 9L23 16L16 23" stroke="var(--terra)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="12" cy="16" r="2.5" fill="var(--terra)" />
            </svg>
          </div>
          <div className="brand-title">
            <h1>Code<span className="brand-title-accent">Reviewer</span><span className="brand-title-dot">.</span></h1>
            <p className="brand-subtitle">AI Code Intelligence</p>
          </div>
        </div>

        <div className="header-actions">
          {/* Tabs Navigation */}
          <div className="tabs">
            <button 
              className={`tab-btn ${activeTab === "review" ? "active" : ""}`}
              onClick={() => setActiveTab("review")}
            >
              <GitPullRequest size={16} />
              Review PR
            </button>
            <button 
              className={`tab-btn ${activeTab === "rules" ? "active" : ""}`}
              onClick={() => setActiveTab("rules")}
            >
              <BookOpen size={16} />
              Rules Manager
            </button>
          </div>

          {/* Settings Button */}
          <button 
            onClick={() => setShowSettings(true)} 
            className="icon-btn" 
            title="Workspace Settings"
          >
            <Settings size={18} />
          </button>

          {/* Logout button if authenticated */}
          {authRequired && accessKey && (
            <button onClick={handleLogout} className="icon-btn" title="Logout" style={{ borderColor: "rgba(184, 74, 34, 0.2)" }}>
              <LogOut size={18} style={{ color: "var(--terra)" }} />
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main>
        {activeTab === "review" ? (
          <ReviewTab accessKey={accessKey} addToast={addToast} />
        ) : (
          <RulesTab accessKey={accessKey} addToast={addToast} />
        )}
      </main>

      {/* Toast Notification Container */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            {toast.type === "success" && <CheckCircle size={16} style={{ color: "var(--color-safe)" }} />}
            {toast.type === "error" && <XCircle size={16} style={{ color: "var(--color-bug)" }} />}
            {toast.type !== "success" && toast.type !== "error" && <Info size={16} style={{ color: "var(--terra)" }} />}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
