import { fetchUser, getUser } from "../auth";
import { navigateTo } from "../router";

export function loginPage(pageContent: HTMLElement) {
  document.title = "Login";
  if (getUser()) {
    navigateTo("");
    return () => {};
  }
  const content = `
    <h1>Login</h1>
    <form id="loginForm">
      <div class="form-row">
        <label class="form-label">Email:</label>
        <input class="form-input" type="email" name="email" required>
      </div>
      <div class="form-row">
        <label class="form-label">Passwort:</label>
        <input class="form-input" type="password" name="password" required>
      </div>
      <button type="submit">Login</button>
    </form>
    <p>Noch keinen Account? <a href="register" class="nav-link" data-route="register">Registrieren</a></p>
    <div id="loginError" style="color:red;"></div>
  `;
  pageContent.innerHTML = content;
  const form = document.getElementById("loginForm") as HTMLFormElement | null;
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form) return;
    const data = new FormData(form);
    const email = data.get("email");
    const password = data.get("password");
    try {
      const res = await fetch(`${__BACKEND_URL__}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });
      if (res.ok) {
        await fetchUser();
        navigateTo("");
      } else {
        const errMsg = await res.text();
        document.getElementById("loginError").textContent =
          "Login fehlgeschlagen. " + errMsg;
      }
    } catch (err) {
      document.getElementById("loginError").textContent =
        "Netzwerkfehler beim Login.";
      console.error("Login Fehler:", err);
    }
  });
  return () => {};
}
