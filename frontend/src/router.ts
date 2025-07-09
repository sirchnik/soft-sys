// Routing logic
import { renderNavBar } from "./navbar";
import { homePage } from "./pages/homePage";
import { canvasPage as canvasPage } from "./drawer/drawer";
import { loginPage } from "./pages/loginPage";
import { registerPage } from "./pages/registerPage";
import { userInfoPage } from "./pages/userInfoPage";

let afterLeave = () => {};
let pageContent: HTMLElement | null = null;

export function setPageContent(el: HTMLElement) {
  pageContent = el;
}

export const routes: Record<
  string,
  (pageContent: HTMLElement) => (() => void) | Promise<() => void>
> = {
  "": homePage,
  canvas: canvasPage,
  login: loginPage,
  register: registerPage,
  user: userInfoPage,
  404: notFound,
};

export async function renderPage(route: string) {
  try {
    afterLeave();
    const matchedRoute =
      (route.startsWith("/")
        ? route.split("/")[1]?.trim()
        : route.split("/")[0]?.trim()) || "";
    renderNavBar(matchedRoute);
    const pageFn = routes[matchedRoute] || routes["404"];
    afterLeave = (await pageFn(pageContent)) || (() => {});
  } catch (error) {
    console.error(error);
    pageContent.innerHTML = "<h1>Fehler beim Laden der Seite</h1>";
  }
}

export function navigateTo(route: string) {
  if (route === "" || route === "/") {
    history.pushState({}, "", "/");
    renderPage("");
    return;
  }
  history.pushState({}, "", route);
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
