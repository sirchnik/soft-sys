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

let user: { email?: string } | null = null;

async function fetchUser() {
  try {
    const res = await fetch("http://localhost:8000/api/me", {
      credentials: "include",
    });
    if (res.ok) {
      user = await res.json();
    } else {
      user = null;
    }
  } catch {
    user = null;
  }
}

function renderNavBar(current: string) {
  // Only show nav items the user can access
  const isAuth = !!user;
  const navItems = [
    { name: "Home", route: "", show: isAuth },
    { name: "Canvas", route: "canvas", show: isAuth },
    { name: "Login", route: "login", show: !isAuth },
    { name: "Register", route: "register", show: !isAuth },
  ];
  const navList = document.getElementById("navbar-list");
  if (navList) {
    navList.innerHTML = navItems
      .filter((item) => item.show)
      .map(
        (item) =>
          `<li><a href="${item.route}" class="nav-link${
            current === item.route ? " active" : ""
          }"
            data-route="${item.route}">${item.name}</a></li>`
      )
      .join("");
  }
  // User info and logout
  const userInfo = document.getElementById("navbar-user-info");
  const logoutBtn = document.getElementById("logout-btn");
  if (userInfo) userInfo.textContent = isAuth ? user.email : "Gast";
  if (logoutBtn) logoutBtn.style.display = isAuth ? "inline-block" : "none";
}

function setupNavEvents() {
  document.addEventListener("click", (event) => {
    const link = (event.target as HTMLElement).closest(
      "a.nav-link[data-route]"
    );
    if (link) {
      event.preventDefault();
      const path = link.getAttribute("data-route") || "";
      navigateTo(path);
    }
  });
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      await fetch("http://localhost:8000/api/logout", {
        method: "POST",
        credentials: "include",
      });
      user = null;
      navigateTo("login");
    };
  }
}

async function init() {
  await fetchUser();
  setupNavEvents();
  const currentRoute = window.location.pathname.replace("/", "");
  await renderPage(currentRoute);
  window.addEventListener("popstate", (event) => {
    renderPage(event.state?.path || "");
  });
}

async function renderPage(route: string) {
  try {
    afterLeave();
    renderNavBar(route);
    const pageContent = document.querySelector(".page-content");
    if (pageContent) pageContent.innerHTML = "";
    afterLeave = (await (routes[route] || routes.index)()) || (() => {});
  } catch (error) {
    console.error(error);
    const pageContent = document.querySelector(".page-content");
    if (pageContent)
      pageContent.innerHTML = "<h1>Fehler beim Laden der Seite</h1>";
  }
}

function canvas() {
  document.title = "Canvas";
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
  const pageContent = document.querySelector(".page-content");
  if (pageContent) pageContent.innerHTML = content;
  return initDrawer();
}

function notFound() {
  document.title = "404 - Seite nicht gefunden";
  const pageContent = document.querySelector(".page-content");
  if (pageContent)
    pageContent.innerHTML = `
      <h1>404 - Seite nicht gefunden</h1>
      <p>Die angeforderte Seite existiert nicht.</p>
      <a href="/" class="nav-link" data-route="">Zurück zur Startseite</a>
    `;
  return () => {};
}

function navigateTo(route: string) {
  history.pushState({ path: route }, "", route);
  renderPage(route);
}

function home() {
  document.title = "Home";
  if (!user) {
    navigateTo("login");
    return () => {};
  }
  canvas();
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
    <p>Noch keinen Account? <a href="register" class="nav-link" data-route="register">Registrieren</a></p>
    <div id="loginError" style="color:red;"></div>
  `;
  const pageContent = document.querySelector(".page-content");
  if (pageContent) pageContent.innerHTML = content;
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
      await fetchUser();
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
    <p>Schon einen Account? <a href="login" class="nav-link" data-route="login">Login</a></p>
    <div id="registerError" style="color:red;"></div>
  `;
  const pageContent = document.querySelector(".page-content");
  if (pageContent) pageContent.innerHTML = content;
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
