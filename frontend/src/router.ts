// Routing logic
import { renderNavBar } from "./navbar";
import { canvas } from "./canvasPage";
import { getUser, fetchUser } from "./auth";

let afterLeave = () => {};
let pageContent: HTMLElement | null = null;

export function setPageContent(el: HTMLElement) {
  pageContent = el;
}

export const routes: Record<string, () => (() => void) | Promise<() => void>> =
  {
    "": home,
    login,
    register,
    404: notFound,
  };

export async function renderPage(route: string) {
  try {
    afterLeave();
    renderNavBar(route);
    afterLeave = (await (routes[route] || routes["404"])()) || (() => {});
  } catch (error) {
    console.error(error);
    pageContent.innerHTML = "<h1>Fehler beim Laden der Seite</h1>";
  }
}

export function navigateTo(route: string) {
  history.replaceState({ path: route }, "", route);
  renderPage(route);
}

function notFound() {
  document.title = "404 - Seite nicht gefunden";
  pageContent.innerHTML = `
      <h1>404 - Seite nicht gefunden</h1>
      <p>Die angeforderte Seite existiert nicht.</p>
      <a href="/" class="nav-link" data-route="">Zurück zur Startseite</a>
    `;
  return () => {};
}

function home() {
  document.title = "Home";
  if (!getUser()) {
    navigateTo("login");
    return () => {};
  }
  canvas(pageContent);
  return () => {};
}

function login() {
  document.title = "Login";
  if (getUser()) {
    navigateTo("");
    return () => {};
  }
  if (!pageContent) return () => {};
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
      const res = await fetch("http://localhost:8000/api/auth/login", {
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

function register() {
  document.title = "Registrieren";
  if (!pageContent) return () => {};
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
