import { useState, useEffect } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import { authClient } from "./lib/auth";
import { STORAGE_KEYS, clearSessionScopedState } from "./lib/storageKeys";
import usePersistentState from "./hooks/usePersistentState";
import ReviewTab from "./components/ReviewTab";
import RulesTab from "./components/RulesTab";
import OnboardingOverlay from "./components/OnboardingOverlay";
import Header from "./components/Header";
import ToastContainer from "./components/ToastContainer";
import AuthGuard from "./components/AuthGuard";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";

/* ─── Dashboard (protected) ────────────────────────────────────── */
function Dashboard() {
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();

  // Settings modal state
  const [showSettings, setShowSettings] = useState(false);

  // Layout states (persisted so the active tab survives a refresh)
  const [activeTab, setActiveTab] = usePersistentState(STORAGE_KEYS.activeTab, "review");

  // Toast notifications state
  const [toasts, setToasts] = useState([]);

  // Toast utility
  const addToast = (message, type = "info") => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Ensure dark mode is always disabled
  useEffect(() => {
    document.body.classList.remove("dark");
    localStorage.removeItem(STORAGE_KEYS.theme);
  }, []);

  const handleLogout = async () => {
    await authClient.signOut();
    clearSessionScopedState(); // don't leak this user's review into the next login
    navigate("/login", { replace: true });
  };

  return (
    <div className="app-container">
      {showSettings && (
        <OnboardingOverlay
          settingsMode={true}
          onClose={() => {
            setShowSettings(false);
            addToast("Settings updated!", "success");
          }}
        />
      )}

      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSettings={() => setShowSettings(true)}
        showLogout={!!session}
        onLogout={handleLogout}
        userName={session?.user?.name}
      />

      {/* Main Content Area */}
      <main>
        {activeTab === "review" ? (
          <ReviewTab accessKey="" addToast={addToast} />
        ) : (
          <RulesTab accessKey="" addToast={addToast} />
        )}
      </main>

      <ToastContainer toasts={toasts} />
    </div>
  );
}

/* ─── App Router ────────────────────────────────────────────────── */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        path="/*"
        element={
          <AuthGuard>
            <Dashboard />
          </AuthGuard>
        }
      />
    </Routes>
  );
}
