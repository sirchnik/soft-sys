import { navigateTo } from "../router";

export function registerPage(pageContent: HTMLElement) {
  document.title = "Registrieren";
  const content = `
    <h1>Registrieren</h1>
    <form id="registerForm">
      <div class="form-row">
        <label class="form-label">Email:</label>
        <input class="form-input" type="email" name="email" required>
      </div>
      <div class="form-row">
        <label class="form-label">Display Name:</label>
        <input class="form-input" type="text" name="display_name" required>
      </div>
      <div class="form-row">
        <label class="form-label">Passwort:</label>
        <input class="form-input" type="password" name="password" required>
      </div>
      <button type="submit">Registrieren</button>
    </form>
    <p>Schon einen Account? <a href="login" class="nav-link" data-route="login">Login</a></p>
    <div id="registerError" style="color:red;"></div>
  `;
  pageContent.innerHTML = content;
  const form = document.getElementById(
    "registerForm"
  ) as HTMLFormElement | null;
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form) return;
    const data = new FormData(form);
    const email = data.get("email");
    const password = data.get("password");
    const display_name = data.get("display_name");
    try {
      const res = await fetch("http://localhost:8000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, display_name }),
        credentials: "include",
      });
      if (res.ok) {
        navigateTo("login");
      } else {
        const errMsg = await res.text();
        document.getElementById("registerError").textContent =
          "Registrierung fehlgeschlagen. " + errMsg;
      }
    } catch (err) {
      document.getElementById("registerError").textContent =
        "Netzwerkfehler bei der Registrierung.";
      console.error("Registrierung Fehler:", err);
    }
  });
  return () => {};
}
