import { useEffect, useState } from "react";
import { getCurrentUser, type CurrentUser } from "./api";
import { LoginForm } from "./LoginForm";
import { SignedInView } from "./SignedInView";

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
    <main>
      <h1>Habit & Activity Tracker</h1>
      {loading ? (
        <p>Loading…</p>
      ) : loadError ? (
        <p role="alert">{loadError}</p>
      ) : user ? (
        <SignedInView user={user} onLogout={() => setUser(null)} />
      ) : (
        <LoginForm onLogin={setUser} />
      )}
    </main>
  );
}

export default App;
