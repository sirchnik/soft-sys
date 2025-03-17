/**
 * @type {HTMLElement}
 */
// @ts-ignore
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
  const currentRoute = window.location.pathname.replace("/", "");
  renderPage(currentRoute);
  window.addEventListener("popstate", (event) => {
    renderPage(event.state?.path || "");
  });
}

// ChatGPT
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

/**
 * @param {string} route
 */
async function renderPage(route) {
  try {
    const response = await fetch(`/api/${route || "index"}`);
    if (!response.ok) throw new Error("Seite konnte nicht geladen werden.");
    const data = await response.json();
    app.innerHTML = data.html;
  } catch (error) {
    console.error(error);
    app.innerHTML = "<h1>Fehler beim Laden der Seite</h1>";
  }
}

function hallo() {
  app.innerHTML = `
      <h1 id="greeting">Hallo, Welt! 👋</h1>
      <button class="fancy-button" onclick="changeGreeting()">Klick mich!</button>
      <a href="/" class="nav-link start-button">Zurück</a>
    `;
}

function index() {
  app.innerHTML = `
      <h1>Willkommen! 🎉</h1>
      <a href="hallo" class="nav-link start-button">Starte die Magie ✨</a>
    `;
}

function changeGreeting() {
  const greetings = [
    "Hallo, Welt!",
    "Servus! 🤠",
    "Moin! ⚓",
    "Grüzi! 🇨🇭",
    "Salut! 🥖",
  ];
  const randomGreeting =
    greetings[Math.floor(Math.random() * greetings.length)];
  // @ts-ignore
  document.getElementById("greeting").textContent = randomGreeting;
}

/**
 * @param {string} route
 */
function navigateTo(route) {
  history.pushState({ path: route }, "", route); // Update URL without reloading
  renderPage(route);
}
