// User info page for viewing and editing user details
import { getUser } from "../auth";
import { navigateTo } from "../router";

export async function userInfoPage(pageContent: HTMLElement) {
  const user = getUser();
  if (!user) {
    pageContent.innerHTML = `<h2>Bitte einloggen</h2>`;
    return () => {};
  }
  const display_name = (user as any).display_name || "";
  pageContent.innerHTML = `
    <h2>Benutzerinformationen</h2>
    <form id="user-info-form">
      <label>ID: <input type="text" value="${user.id}" disabled /></label><br />
      <label>Email: <input type="email" name="email" value="${user.email}" required /></label><br />
      <label>Name: <input type="text" name="display_name" value="${display_name}" /></label><br />
      <button type="submit">Aktualisieren</button>
      <span id="user-info-msg"></span>
    </form>
  `;
  const form = document.getElementById("user-info-form") as HTMLFormElement;
  const msg = document.getElementById("user-info-msg");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const email = formData.get("email");
    const display_name = formData.get("display_name");
    try {
      const resp = await fetch(`${__BACKEND_URL__}/api/user/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, display_name }),
        credentials: "include",
      });
      user.email = email as string;
      user.display_name = display_name as string;
      if (!resp.ok) {
        throw new Error("Update fehlgeschlagen");
      }
      navigateTo("/");
    } catch (err) {
      msg.textContent = "Fehler beim Aktualisieren.";
    }
  };
  return () => {};
}
