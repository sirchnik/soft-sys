let user: { email?: string } | null = null;

export async function fetchUser() {
  try {
    const res = await fetch("http://localhost:8000/api/me", {
      credentials: "include",
    });
    if (res.ok) {
      user = await res.json();
    } else {
      user = null;
    }
  } catch (err) {
    console.error("Fehler beim Laden des Benutzers:", err);
    user = null;
  }
}

export async function checkAuth(): Promise<boolean> {
  try {
    const res = await fetch("http://localhost:8000/api/me", {
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function getUser() {
  return user;
}

export async function logout() {
  await fetch("http://localhost:8000/api/logout", {
    method: "POST",
    credentials: "include",
  });
  user = null;
}
