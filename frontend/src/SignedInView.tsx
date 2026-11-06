import type { CurrentUser } from "./api";
import { Templates } from "./Templates";

export function SignedInView({ user, onLogout }: { user: CurrentUser; onLogout: () => void }) {
  return <Templates role={user.role} onUnauthorized={onLogout} />;
}
