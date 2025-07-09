import { getUser } from "../auth";
import { navigateTo } from "../router";

export function homePage(pageContent: HTMLElement) {
  document.title = "Home";
  if (!getUser()) {
    navigateTo("login");
    return () => {};
  }
  home(pageContent);
  return () => {};
}

export async function home(pageContent: HTMLElement) {
  const user = getUser();
  document.title = "Canvas";

  // Use user.canvases directly, do not fetch canvases data
  const canvasesData = user.canvases;

  // Render UI
  pageContent.innerHTML = `
    <h2>Select a Canvas</h2>
    <div id="canvas-list" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.2em; padding: 0.5em 0;">
      ${canvasesData
        .sort((a, b) => a.canvas_id.localeCompare(b.canvas_id))
        .map((canvas) => {
          // Find current user's right for this canvas
          return `<div class="canvas-card" style="background: #fff; border-radius: 10px; box-shadow: 0 2px 10px rgba(79,140,255,0.08); padding: 1.2em 1.5em; width: 100%; min-height: 150px; display: flex; flex-direction: column; align-items: flex-start; gap: 0.7em; border: 1.5px solid #e3edff; box-sizing: border-box;">
              <div style="font-size: 1.13em; font-weight: 600; color: #23272f;">${
                canvas.canvas_id
              }</div>
              <div style="font-size: 0.98em; color: #4f8cff; font-weight: 500;">Right: ${
                canvas.right
              }</div>
              <div style="display: flex; gap: 0.7em;">
                <button data-id="${
                  canvas.canvas_id
                }" class="open-canvas-btn" style="background: #4f8cff; color: #fff; border: none; border-radius: 5px; padding: 0.45em 1.2em; font-size: 1em; font-weight: 500; cursor: pointer; transition: background 0.18s; box-shadow: 0 2px 8px rgba(79,140,255,0.09);">Open</button>
                ${
                  canvas.right === "M" || canvas.right === "O"
                    ? `<button class="manage-rights" data-id="${canvas.canvas_id}" style="background: #fff; color: #4f8cff; border: 1.5px solid #4f8cff; border-radius: 5px; padding: 0.45em 1.2em; font-size: 1em; font-weight: 500; cursor: pointer; transition: background 0.18s, color 0.18s;">Manage Rights</button>`
                    : ""
                }
              </div>
            </div>`;
        })
        .join("")}
    </div>
    <h3 style="margin-top:2em;">Or Create a New Canvas</h3>
    <form id="create-canvas-form" style="margin-bottom:1.2em;">
      <button type="submit" style="background: #22c55e; color: #fff; border: none; border-radius: 5px; padding: 0.5em 1.5em; font-size: 1em; font-weight: 500; cursor: pointer; transition: background 0.18s; box-shadow: 0 2px 8px rgba(34,197,94,0.09);">Create</button>
    </form>
    <div id="canvas-error" style="color:red;"></div>
    <!-- Modal for managing rights -->
    <div id="rights-modal" style="display:none; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:#fff; border:1px solid #ccc; padding:1.5em 2em; z-index:1000; border-radius:10px; box-shadow:0 4px 32px rgba(0,0,0,0.18); min-width:340px; max-width:90vw; max-height:80vh; overflow-y:auto;"></div>
  `;

  // Handle canvas selection
  pageContent.querySelectorAll(".open-canvas-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const button = e.target as HTMLButtonElement;
      const id = button.dataset.id;
      navigateTo(`/canvas/${id}`);
    });
  });

  // Handle canvas creation
  const form = pageContent.querySelector(
    "#create-canvas-form"
  ) as HTMLFormElement;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const resp = await fetch(`${__BACKEND_URL__}/api/canvas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "include",
      });
      if (resp.ok) {
        const newCanvas = await resp.json();
        console.log("New canvas created:", newCanvas);
        // Refetch user or push to user.canvases if needed
        await import("../auth").then((m) => m.fetchUser());
        navigateTo(`/canvas/${newCanvas.id}`);
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

  // Add manage rights UI
  pageContent.querySelectorAll(".manage-rights").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = (e.target as HTMLButtonElement).dataset.id;
      const modal = pageContent.querySelector("#rights-modal") as HTMLElement;
      // Find canvas data from user.canvases
      const canvasData = canvasesData.find((c) => c.canvas_id === id);
      if (!canvasData) {
        modal.innerHTML = `<div style=\"color:red;\">Failed to load rights: Canvas data not found</div><button id=\"close-rights-modal\">Close</button>`;
        (modal.querySelector("#close-rights-modal") as HTMLElement).onclick =
          () => {
            modal.style.display = "none";
          };
        modal.style.display = "block";
        return;
      }
      modal.innerHTML = `
          <h4>Manage Rights for Canvas ${id}</h4>
          <div style=\"margin-bottom:2em;\">Moderated: <b>${
            canvasData.moderated ? "Yes" : "No"
          }</b> <button id="toggle-moderated" style="margin-left:1em; background:#f3f4f6; border:1px solid #4f8cff; color:#4f8cff; border-radius:5px; padding:0.2em 0.8em; cursor:pointer; font-size:0.95em;">${
        canvasData.moderated ? "Disable" : "Enable"
      }</button></div>
          <table style="width:100%; border-collapse:collapse;">
            <tr><th>User Email</th><th>Right</th><th>Change</th><th>Remove</th></tr>
            ${canvasData.rights
              .map(
                (r) => `
                  <tr>
                    <td>${r.email}</td>
                    <td>${r.right}</td>
                    <td>
                      <form class="change-right-form" data-email="${r.email}">
                        <select name="right" style="min-width:80px">
                          <option value="R" ${
                            r.right === "R" ? "selected" : ""
                          }>R</option>
                          <option value="W" ${
                            r.right === "W" ? "selected" : ""
                          }>W</option>
                          <option value="V" ${
                            r.right === "V" ? "selected" : ""
                          }>V</option>
                          <option value="M" ${
                            r.right === "M" ? "selected" : ""
                          }>M</option>
                          <option value="O" ${
                            r.right === "O" ? "selected" : ""
                          }>O</option>
                        </select>
                        <button type="submit">Set</button>
                      </form>
                    </td>
                    <td>
                      <button class="remove-right-btn" data-email="${
                        r.email
                      }">Remove</button>
                    </td>
                  </tr>
                `
              )
              .join("")}
          </table>
          <h5>Add User Right</h5>
          <form id="add-right-form">
            <input type="email" name="email" placeholder="User email" required style="min-width:180px" />
            <select name="right" style="min-width:80px">
              <option value="R">R</option>
              <option value="W">W</option>
              <option value="V">V</option>
              <option value="M">M</option>
              <option value="O">O</option>
            </select>
            <button type="submit">Add</button>
          </form>
          <button type="button" id="close-rights-modal">Close</button>
          <div id="rights-error" style="color:red;"></div>
        `;
      modal.style.display = "block";
      (modal.querySelector("#close-rights-modal") as HTMLElement).onclick =
        () => {
          modal.style.display = "none";
        };
      // Moderated toggle
      (modal.querySelector("#toggle-moderated") as HTMLElement).onclick =
        async () => {
          try {
            const resp = await fetch(
              `${__BACKEND_URL__}/api/canvas/${id}/moderated`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ moderated: !canvasData.moderated }),
                credentials: "include",
              }
            );
            if (!resp.ok) {
              (
                modal.querySelector("#rights-error") as HTMLElement
              ).textContent = resp.statusText;
            } else {
              await import("../auth").then((m) => m.fetchUser());
              home(pageContent);
            }
          } catch (err) {
            (modal.querySelector("#rights-error") as HTMLElement).textContent =
              "Failed to update moderated status";
          }
        };
      modal.querySelectorAll(".change-right-form").forEach((form) => {
        form.addEventListener("submit", async (ev) => {
          ev.preventDefault();
          const email = (form as HTMLFormElement).dataset.email;
          const right = (form as HTMLFormElement).right.value;
          await updateUserRight({
            modal,
            id,
            email,
            right,
            successMsg: "Right updated.",
          });
        });
      });
      // Remove right buttons
      modal.querySelectorAll(".remove-right-btn").forEach((btn) => {
        btn.addEventListener("click", async (ev) => {
          const email = (btn as HTMLButtonElement).dataset.email;
          await updateUserRight({
            modal,
            id,
            email,
            right: null,
            successMsg: "Right removed.",
            btn,
          });
        });
      });
      // Add right form
      (
        modal.querySelector("#add-right-form") as HTMLFormElement
      ).addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const form = ev.target as HTMLFormElement;
        const email = form.email.value;
        const right = form.right.value;
        try {
          const resp = await fetch(
            `${__BACKEND_URL__}/api/canvas/${id}/right`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, right }),
              credentials: "include",
            }
          );
          if (!resp.ok) {
            (modal.querySelector("#rights-error") as HTMLElement).textContent =
              await resp.text();
          } else {
            (modal.querySelector("#rights-error") as HTMLElement).textContent =
              "Right added.";
            await import("../auth").then((m) => m.fetchUser());
            home(pageContent);
          }
        } catch (err) {
          (modal.querySelector("#rights-error") as HTMLElement).textContent =
            "Failed to add right.";
        }
      });
    });
  });

  // Helper to update rights and handle UI
  async function updateUserRight({
    modal,
    id,
    email,
    right,
    successMsg,
    btn = null,
  }: {
    modal: HTMLElement;
    id: string;
    email: string;
    right: string | null;
    successMsg: string;
    btn?: Element | null;
  }) {
    const isRemove = right === null;
    let errorMsg = isRemove
      ? "Failed to remove right."
      : "Failed to change rights.";
    try {
      const resp = await fetch(`${__BACKEND_URL__}/api/canvas/${id}/right`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, right }),
        credentials: "include",
      });
      const rightsError = modal.querySelector("#rights-error") as HTMLElement;
      if (!resp.ok) {
        rightsError.textContent = await resp.text();
        return;
      }
      rightsError.textContent = successMsg;
      // Always refetch user and rerender
      await import("../auth").then((m) => m.fetchUser());
      home((modal.closest("#page-content") as HTMLElement) || document.body);
    } catch (err) {
      (modal.querySelector("#rights-error") as HTMLElement).textContent =
        errorMsg;
    }
  }
}
