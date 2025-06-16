import { getUser } from "./auth";
import { init as initDrawer } from "./drawer/drawer";

export async function canvas(pageContent: HTMLElement) {
  const user = await getUser();
  document.title = "Canvas";

  // Fetch user's canvases

  // Render UI
  pageContent.innerHTML = `
    <h2>Select a Canvas</h2>
    <ul id="canvas-list">
      ${Object.entries(user?.canvases)
        .map(
          ([id, right]) =>
            `<li><button data-id="${id}">${id}: ${right}</button></li>`
        )
        .join("")}
    </ul>
    <h3>Or Create a New Canvas</h3>
    <form id="create-canvas-form">
      <button type="submit">Create</button>
    </form>
    <div id="canvas-error" style="color:red;"></div>
  `;

  // Handle canvas selection
  pageContent.querySelectorAll("#canvas-list button").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = (e.target as HTMLButtonElement).dataset.id;
      initDrawer(pageContent, id);
    });
  });

  // Handle canvas creation
  const form = pageContent.querySelector(
    "#create-canvas-form"
  ) as HTMLFormElement;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const resp = await fetch("http://localhost:8000/api/canvas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "include",
      });
      if (resp.ok) {
        const newCanvas = await resp.json();
        initDrawer(pageContent, newCanvas.id);
      } else {
        const err = await resp.text();
        (
          pageContent.querySelector("#canvas-error") as HTMLElement
        ).textContent = err;
      }
    } catch (err) {
      (pageContent.querySelector("#canvas-error") as HTMLElement).textContent =
        "Failed to create canvas.";
    }
  });
}
