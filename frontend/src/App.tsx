import { useEffect, useState } from "react";
import "./App.css";
import { getCurrentUser, logout, type CurrentUser } from "./api";
import { LoginForm } from "./LoginForm";
import { SignedInView } from "./SignedInView";

function RoleBadge({ role }: { role: CurrentUser["role"] }) {
  const label = role === "MANAGER" ? "Manager" : "Participant";
  return (
    <span className={`role-badge${role === "MANAGER" ? " role-badge--manager" : ""}`}>{label}</span>
  );
}

function Header({ user, onLogout }: { user: CurrentUser | null; onLogout: () => void }) {
  async function handleLogout() {
    await logout();
    onLogout();
  }

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <h1 className="app-name">Habit & Activity Tracker</h1>
        {user && (
          <div className="app-header__user">
            <span className="app-header__email">{user.email}</span>
            <RoleBadge role={user.role} />
            <button type="button" className="btn btn--secondary btn--small" onClick={handleLogout}>
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function App() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUser() {
      try {
        const current = await getCurrentUser();
        if (!cancelled) setUser(current);
      } catch {
        if (!cancelled) setLoadError("Could not reach the server. Please try again later.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadCurrentUser();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="app">
      <Header user={user} onLogout={() => setUser(null)} />
      <main className="app-main">
        {loading ? (
          <p className="status-message">Loading…</p>
        ) : loadError ? (
          <p role="alert" className="error-box">
            {loadError}
          </p>
        ) : user ? (
          <SignedInView user={user} onLogout={() => setUser(null)} />
        ) : (
          <div className="login-page">
            <LoginForm onLogin={setUser} />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
