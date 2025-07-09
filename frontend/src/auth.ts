let user: {
  email: string;
  canvases: {
    canvas_id: string;
    moderated: boolean;
    right: string;
    rights: { email: string; right: string }[] | null;
  }[];
  id: string;
} | null = null;

export async function fetchUser() {
  try {
    const userRes = await fetch(`${__BACKEND_URL__}/api/auth/me`, {
      credentials: "include",
    });
    const canvasRes = await fetch(`${__BACKEND_URL__}/api/canvas/datas`, {
      credentials: "include",
    });
    if (userRes.ok) {
      user = {
        ...(await userRes.json()),
        canvases: await canvasRes.json(),
      };
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
