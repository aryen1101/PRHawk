import { useState } from "react";
import { Link } from "react-router-dom";
import { authClient } from "../lib/auth";
import {
  Mail, Lock, User, ArrowRight, AlertCircle, Eye, EyeOff, Check,
} from "lucide-react";

const strengthLevels = [
  { label: "Weak", color: "#B84A22", min: 0 },
  { label: "Fair", color: "#946422", min: 1 },
  { label: "Good", color: "#2A6A8C", min: 2 },
  { label: "Strong", color: "#2D7A4D", min: 3 },
];

function getPasswordStrength(password) {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 3);
}

export default function SignupPage() {

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const strength = getPasswordStrength(password);
  const level = strengthLevels[strength];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      setError("Please fill in all fields.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error: authError } = await authClient.signUp.email({
        name: name.trim(),
        email: email.trim(),
        password,
      });

      if (authError) {
        setError(authError.message || "Could not create account. Try again.");
      } else {
        // Auto-login after signup: better-auth sets the session cookie on signUp
        window.location.href = "/";
        return;
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Decorative background elements */}
      <div className="auth-bg-glow auth-bg-glow-1" />
      <div className="auth-bg-glow auth-bg-glow-2" />

      <div className="auth-card animate-fade-in">
        {/* Brand */}
        <div className="auth-brand">
          <div className="auth-brand-logo">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 2L30 16L16 30L2 16L16 2Z" stroke="var(--terra)" strokeWidth="2.5" strokeLinejoin="round" />
              <path d="M16 9L23 16L16 23" stroke="var(--terra)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="16" r="2.5" fill="var(--terra)" />
            </svg>
          </div>
          <h1 className="auth-brand-title">
            PR<span className="auth-brand-accent">Hawk</span><span className="auth-brand-dot">.</span>
          </h1>
        </div>

        {/* Heading */}
        <div className="auth-heading">
          <h2>Create your account</h2>
          <p>Get started with AI-powered code reviews</p>
        </div>

        {/* Error */}
        {error && (
          <div className="error-alert animate-fade-in">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label className="form-label" htmlFor="signup-name">Full name</label>
            <div className="auth-input-wrapper">
              <User size={16} className="auth-input-icon" />
              <input
                id="signup-name"
                type="text"
                className="input-text auth-input"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                autoFocus
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="signup-email">Email address</label>
            <div className="auth-input-wrapper">
              <Mail size={16} className="auth-input-icon" />
              <input
                id="signup-email"
                type="email"
                className="input-text auth-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="signup-password">Password</label>
            <div className="auth-input-wrapper">
              <Lock size={16} className="auth-input-icon" />
              <input
                id="signup-password"
                type={showPassword ? "text" : "password"}
                className="input-text auth-input"
                placeholder="Min. 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Password strength bar */}
            {password.length > 0 && (
              <div className="password-strength">
                <div className="password-strength-track">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="password-strength-segment"
                      style={{
                        backgroundColor: i <= strength ? level.color : "var(--border)",
                        transition: "background-color 0.3s var(--ease)",
                      }}
                    />
                  ))}
                </div>
                <span className="password-strength-label" style={{ color: level.color }}>
                  {level.label}
                </span>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="signup-confirm">Confirm password</label>
            <div className="auth-input-wrapper">
              <Lock size={16} className="auth-input-icon" />
              <input
                id="signup-confirm"
                type={showPassword ? "text" : "password"}
                className="input-text auth-input"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
              {confirmPassword && confirmPassword === password && (
                <div className="auth-match-icon">
                  <Check size={16} />
                </div>
              )}
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary auth-submit-btn"
            disabled={loading}
          >
            {loading ? (
              <div className="auth-btn-loader" />
            ) : (
              <>
                Create Account
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="auth-footer">
          <p>
            Already have an account?{" "}
            <Link to="/login" className="auth-link">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
