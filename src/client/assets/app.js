window.addEventListener("popstate", (event) => {
  renderPage(event.state?.path || "");
});

const currentRoute = window.location.pathname.replace("/", "");
renderPage(currentRoute);

/**
 * @param {string} route
 */
function renderPage(route) {
  /**
   * @type {Record<string, (()=>void)|undefined>}
   */
  const routes = {
    index,
    hallo,
    "": index,
  };

  (routes[route] || index)();
}

/**
 * @type {HTMLElement}
 */
// @ts-ignore
const app = document.getElementById("app");
if (app === null) {
  throw "App could not be loaded.";
}

function hallo() {
  app.innerHTML = `
      <h1 id="greeting">Hallo, Welt! 👋</h1>
      <button class="fancy-button" onclick="changeGreeting()">Klick mich!</button>
    `;
}

function index() {
  app.innerHTML = `
      <h1>Willkommen! 🎉</h1>
      <button onclick="navigateTo('hallo')" class="start-button">Starte die Magie ✨</button>
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
