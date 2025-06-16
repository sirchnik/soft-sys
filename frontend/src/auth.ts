let user: { email: string; canvases: Record<string, string> } | null = null;

export async function fetchUser() {
  try {
    const res = await fetch("http://localhost:8000/api/auth/me", {
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
  await fetch("http://localhost:8000/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  user = null;
}
