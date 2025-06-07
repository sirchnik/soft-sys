import { init as initDrawer } from "./drawer.js";

const routes: Record<string, () => () => void> = {
  "": index,
  index,
  canvas,
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

async function renderPage(route: string) {
  try {
    afterLeave();
    afterLeave = routes[route]?.() || routes.index();
  } catch (error) {
    console.error(error);
    app.innerHTML = "<h1>Fehler beim Laden der Seite</h1>";
  }
}

function canvas() {
  document.title = "Canvas";
  app.innerHTML = `
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
  return initDrawer();
}

function index() {
  app.innerHTML = `
      <h1>Willkommen! 🎉</h1>
      <a href="canvas" class="nav-link start-button">Starte die Magie ✨</a>
    `;
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
