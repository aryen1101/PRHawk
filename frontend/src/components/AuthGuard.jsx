import { Navigate } from "react-router-dom";
import { authClient } from "../lib/auth";

/**
 * Wraps protected routes. Redirects to /login when there is no active session.
 * Shows a full-screen spinner while the session status is being resolved.
 */
export default function AuthGuard({ children }) {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div className="auth-guard-loader">
        <div className="loader-spinner" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
