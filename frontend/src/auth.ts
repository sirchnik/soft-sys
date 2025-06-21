let user: {
  email: string;
  canvases: Record<string, string>;
  id: string;
} | null = null;

export async function fetchUser() {
  try {
    const res = await fetch(`${__BACKEND_URL__}/api/auth/me`, {
      credentials: "include",
    });
    if (res.ok) {
      user = await res.json();
      console.log("Benutzer erfolgreich geladen:", user);
    } else {
      user = null;
    }
  } catch (err) {
    console.error("Fehler beim Laden des Benutzers:", err);
    user = null;
  }
}

export function getUser() {
  return user;
}

export async function logout() {
  await fetch(`${__BACKEND_URL__}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
  user = null;
}
