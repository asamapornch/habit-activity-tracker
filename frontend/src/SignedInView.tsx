import { logout, type CurrentUser } from "./api";

export function SignedInView({ user, onLogout }: { user: CurrentUser; onLogout: () => void }) {
  async function handleLogout() {
    await logout();
    onLogout();
  }

  return (
    <div>
      <p>
        Signed in as {user.email} ({user.role})
      </p>
      <button type="button" onClick={handleLogout}>
        Logout
      </button>
    </div>
  );
}
