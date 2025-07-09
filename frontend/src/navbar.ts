// Navigation bar rendering and events
import { getUser, logout } from "./auth";
import { navigateTo } from "./router";

export function renderNavBar(current: string) {
  const user = getUser();
  const isAuth = !!user;
  const navItems = [
    { name: "Home", route: "", show: isAuth },
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
  const userInfo = document.getElementById(
    "navbar-user-info"
  ) as HTMLButtonElement;
  const logoutBtn = document.getElementById("logout-btn");
  if (userInfo) {
    userInfo.textContent = isAuth
      ? `${user.email} - ${user.display_name}`
      : "Gast";
    userInfo.disabled = !isAuth;
    if (isAuth) {
      userInfo.style.cursor = "pointer";
      userInfo.onclick = () => navigateTo("user");
    } else {
      userInfo.style.cursor = "default";
      userInfo.onclick = null;
    }
  }
  if (logoutBtn) logoutBtn.style.display = isAuth ? "inline-block" : "none";
}

export function setupNavEvents() {
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
      await logout();
      navigateTo("login");
    };
  }
}
