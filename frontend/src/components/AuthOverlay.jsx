import React, { useState } from "react";
import { Key, Lock, ShieldAlert } from "lucide-react";

export default function AuthOverlay({ onSave, errorMsg }) {
  const [keyInput, setKeyInput] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (keyInput.trim()) {
      onSave(keyInput.trim());
    }
  };

  return (
    <div className="auth-overlay">
      <div className="auth-modal">
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
          <div style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            backgroundColor: "var(--terra-dim)",
            color: "var(--terra)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "0.5rem"
          }}>
            <Lock size={28} />
          </div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "700", letterSpacing: "-0.02em" }}>Authentication Required</h2>
          <p style={{ fontSize: "0.875rem", color: "var(--t2)" }}>
            This PRHawk instance is secured. Please enter the App Access Key to continue.
          </p>
        </div>

        {errorMsg && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.75rem 1rem",
            backgroundColor: "var(--color-bug-dim)",
            color: "var(--color-bug)",
            borderRadius: "var(--r-md)",
            border: "1px solid rgba(184, 74, 34, 0.2)",
            fontSize: "0.85rem",
            fontWeight: "500"
          }}>
            <ShieldAlert size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="form-group">
            <label className="form-label" htmlFor="access-key">Access Key</label>
            <div style={{ position: "relative" }}>
              <input
                id="access-key"
                type="password"
                className="input-text"
                placeholder="Enter APP_SECRET key"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                style={{ paddingLeft: "2.5rem" }}
              />
              <Key size={16} style={{ position: "absolute", left: "1rem", top: "50%", transform: "translateY(-50%)", color: "var(--t3)" }} />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>
            Authenticate
          </button>
        </form>
      </div>
    </div>
  );
}
