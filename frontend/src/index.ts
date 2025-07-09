import { fetchUser } from "./auth";
import { setupNavEvents } from "./navbar";
import { renderPage, setPageContent } from "./router";

let app = document.getElementById("app");
let pageContent = document.querySelector(".page-content") as HTMLElement | null;

async function init() {
  if (!pageContent) {
    pageContent = document.querySelector(".page-content");
  }
  if (!app || !pageContent) {
    throw "App could not be loaded!";
  }
  setPageContent(pageContent);
  fetchUser().then(() => {
    setupNavEvents();
    const currentRoute = window.location.pathname.replace("/", "");
    renderPage(currentRoute);
    window.addEventListener("popstate", (event) => {
      renderPage(event.state?.path || "");
    });
  });
}

if (app === null) {
  document.addEventListener("DOMContentLoaded", () => {
    app = document.getElementById("app");
    pageContent = document.querySelector(".page-content");
    init();
  });
} else {
  init();
}
