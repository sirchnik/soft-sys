import { fetchUser } from "./src/auth";
import { setupNavEvents } from "./src/navbar";
import { renderPage, setPageContent } from "./src/router";

let app = document.getElementById("app");
let pageContent = document.querySelector(".page-content") as HTMLElement | null;

function init() {
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
