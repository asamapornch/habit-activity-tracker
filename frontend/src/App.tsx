import { useEffect, useState } from "react";
import { getCurrentUser, type CurrentUser } from "./api";
import { LoginForm } from "./LoginForm";
import { SignedInView } from "./SignedInView";

function App() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUser().then((current) => {
      setUser(current);
      setLoading(false);
    });
  }, []);

  return (
    <main>
      <h1>Habit & Activity Tracker</h1>
      {loading ? null : user ? (
        <SignedInView user={user} onLogout={() => setUser(null)} />
      ) : (
        <LoginForm onLogin={setUser} />
      )}
    </main>
  );
}

export default App;
