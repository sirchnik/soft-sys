import { init as initDrawer } from "./drawer.js";

const routes: Record<string, () => () => void> = {
  "": home,
  index: home,
  canvas,
  login,
  register,
  404: notFound,
};

let afterLeave = () => {};

let app = document.getElementById("app");
if (app === null) {
  document.addEventListener("DOMContentLoaded", () => {
    // @ts-ignore
    app = document.getElementById("app");
    if (app === null) {
      throw "App could not be loaded!";
    }
    init();
  });
} else {
  init();
}

function init() {
  document.addEventListener("click", (event) => {
    try {
      // @ts-ignore
      const link = event.target.closest("a.nav-link");
      if (link && link.href.startsWith(window.location.origin)) {
        event.preventDefault();
        const path = new URL(link.href).pathname.replace("/", "");
        navigateTo(path);
      }
    } catch {}
  });
  const currentRoute = window.location.pathname.replace("/", "");
  renderPage(currentRoute);
  window.addEventListener("popstate", (event) => {
    renderPage(event.state?.path || "");
  });
}

function renderNavBar(current: string) {
  // Simple nav bar with highlighting for the current page
  const navItems = [
    { name: "Home", route: "", show: true },
    { name: "Canvas", route: "canvas", show: true },
    { name: "Login", route: "login", show: true },
    { name: "Register", route: "register", show: true },
  ];
  return `
    <nav class="navbar">
      <ul class="navbar-list">
        ${navItems
          .map(
            (item) =>
              `<li><a href="${item.route}" class="nav-link${
                current === item.route ? " active" : ""
              }">${item.name}</a></li>`
          )
          .join("")}
      </ul>
    </nav>
  `;
}

async function renderPage(route: string) {
  try {
    afterLeave();
    // Don't show nav bar on 404
    if (route !== "404") {
      app.innerHTML = renderNavBar(route);
    }
    afterLeave = routes[route]?.() || routes.index();
  } catch (error) {
    console.error(error);
    app.innerHTML = "<h1>Fehler beim Laden der Seite</h1>";
  }
}

function canvas() {
  document.title = "Canvas";
  // Only replace the content area, not the nav bar
  const content = `
      <p>
        Wählen Sie auf der linken Seite Ihr Zeichenwerkzeug aus. Haben Sie eines
        ausgewählt, können Sie mit der Maus die entsprechenden Figuren zeichnen.
        Typischerweise, indem Sie die Maus drücken, dann mit gedrückter
        Maustaste die Form bestimmen, und dann anschließend die Maustaste
        loslassen.
      </p>
      <p>Mit shift kann man die Shapes verschieben.</p>
      <ul class="tools"></ul>
      <canvas id="drawArea" width="1024" height="500"></canvas>
      <div class="event-stream-container">
        <textarea id="eventStream" rows="10" cols="130"></textarea>
        <button id="loadEventsButton">Load Events</button>
      </div>
    `;
  app
    .querySelector(".navbar")
    .insertAdjacentHTML(
      "afterend",
      `<div class='page-content'>${content}</div>`
    );
  return initDrawer();
}

function index() {
  const content = `
      <h1>Willkommen! 🎉</h1>
      <a href="canvas" class="nav-link start-button">Starte die Magie ✨</a>
    `;
  app
    .querySelector(".navbar")
    .insertAdjacentHTML(
      "afterend",
      `<div class='page-content'>${content}</div>`
    );
  return () => {};
}

function notFound() {
  document.title = "404 - Seite nicht gefunden";
  app.innerHTML = `
      <h1>404 - Seite nicht gefunden</h1>
      <p>Die angeforderte Seite existiert nicht.</p>
      <a href="/" class="nav-link">Zurück zur Startseite</a>
    `;
  return () => {};
}

function navigateTo(route: string) {
  history.pushState({ path: route }, "", route); // Update URL without reloading
  renderPage(route);
}

function home() {
  // Home page: check JWT, if invalid, redirect to login
  document.title = "Home";
  checkAuth().then((isAuth) => {
    if (!isAuth) {
      navigateTo("login");
      return;
    }
    // If authenticated, show canvas
    canvas();
  });
  return () => {};
}

function login() {
  document.title = "Login";
  const content = `
    <h1>Login</h1>
    <form id="loginForm">
      <label>Email: <input type="email" name="email" required></label><br>
      <label>Passwort: <input type="password" name="password" required></label><br>
      <button type="submit">Login</button>
    </form>
    <p>Noch keinen Account? <a href="register" class="nav-link">Registrieren</a></p>
    <div id="loginError" style="color:red;"></div>
  `;
  app
    .querySelector(".navbar")
    .insertAdjacentHTML(
      "afterend",
      `<div class='page-content'>${content}</div>`
    );
  const form = document.getElementById("loginForm") as HTMLFormElement | null;
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form) return;
    const data = new FormData(form);
    const email = data.get("email");
    const password = data.get("password");
    const res = await fetch("http://localhost:8000/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      credentials: "include",
    });
    if (res.ok) {
      navigateTo("");
    } else {
      document.getElementById("loginError").textContent =
        "Login fehlgeschlagen.";
    }
  });
  return () => {};
}

function register() {
  document.title = "Registrieren";
  const content = `
    <h1>Registrieren</h1>
    <form id="registerForm">
      <label>Email: <input type="email" name="email" required></label><br>
      <label>Passwort: <input type="password" name="password" required></label><br>
      <button type="submit">Registrieren</button>
    </form>
    <p>Schon einen Account? <a href="login" class="nav-link">Login</a></p>
    <div id="registerError" style="color:red;"></div>
  `;
  app
    .querySelector(".navbar")
    .insertAdjacentHTML(
      "afterend",
      `<div class='page-content'>${content}</div>`
    );
  const form = document.getElementById(
    "registerForm"
  ) as HTMLFormElement | null;
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form) return;
    const data = new FormData(form);
    const email = data.get("email");
    const password = data.get("password");
    const res = await fetch("http://localhost:8000/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      credentials: "include",
    });
    if (res.ok) {
      navigateTo("login");
    } else {
      document.getElementById("registerError").textContent =
        "Registrierung fehlgeschlagen.";
    }
  });
  return () => {};
}

async function checkAuth(): Promise<boolean> {
  try {
    const res = await fetch("http://localhost:8000/api/me", {
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}
