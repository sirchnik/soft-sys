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

  // Fetch user's canvases

  // Render UI
  pageContent.innerHTML = `
    <h2>Select a Canvas</h2>
    <div id="canvas-list" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.2em; padding: 0.5em 0;">
      ${Object.entries(user?.canvases)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(
          ([id, right]) =>
            `<div class="canvas-card" style="background: #fff; border-radius: 10px; box-shadow: 0 2px 10px rgba(79,140,255,0.08); padding: 1.2em 1.5em; width: 100%; min-height: 150px; display: flex; flex-direction: column; align-items: flex-start; gap: 0.7em; border: 1.5px solid #e3edff; box-sizing: border-box;">
              <div style="font-size: 1.13em; font-weight: 600; color: #23272f;">${id}</div>
              <div style="font-size: 0.98em; color: #4f8cff; font-weight: 500;">Right: ${right}</div>
              <div style="display: flex; gap: 0.7em;">
                <button data-id="${id}" class="open-canvas-btn" style="background: #4f8cff; color: #fff; border: none; border-radius: 5px; padding: 0.45em 1.2em; font-size: 1em; font-weight: 500; cursor: pointer; transition: background 0.18s; box-shadow: 0 2px 8px rgba(79,140,255,0.09);">Open</button>
                ${
                  right === "M" || right === "O"
                    ? `<button class="manage-rights" data-id="${id}" style="background: #fff; color: #4f8cff; border: 1.5px solid #4f8cff; border-radius: 5px; padding: 0.45em 1.2em; font-size: 1em; font-weight: 500; cursor: pointer; transition: background 0.18s, color 0.18s;">Manage Rights</button>`
                    : ""
                }
              </div>
            </div>`
        )
        .join("")}
    </div>
    <h3 style="margin-top:2em;">Or Create a New Canvas</h3>
    <form id="create-canvas-form" style="margin-bottom:1.2em;">
      <button type="submit" style="background: #22c55e; color: #fff; border: none; border-radius: 5px; padding: 0.5em 1.5em; font-size: 1em; font-weight: 500; cursor: pointer; transition: background 0.18s; box-shadow: 0 2px 8px rgba(34,197,94,0.09);">Create</button>
    </form>
    <div id="canvas-error" style="color:red;"></div>
    <div id="rights-modal" style="display:none; position:fixed; top:20%; left:40%; background:#fff; border:1px solid #ccc; padding:1em; z-index:1000;"></div>
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
        user.canvases[newCanvas.id] = "O";
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
      modal.innerHTML = `<div>Loading rights...</div>`;
      modal.style.display = "block";
      try {
        const resp = await fetch(`${__BACKEND_URL__}/api/canvas/${id}/rights`, {
          credentials: "include",
        });
        if (!resp.ok) throw new Error(await resp.text());
        const rights = await resp.json();
        modal.innerHTML = `
          <h4>Manage Rights for Canvas ${id}</h4>
          <table style="width:100%; border-collapse:collapse;">
            <tr><th>User Email</th><th>Right</th><th>Change</th><th>Remove</th></tr>
            ${rights
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
        (modal.querySelector("#close-rights-modal") as HTMLElement).onclick =
          () => {
            modal.style.display = "none";
          };
        // Change right forms
        modal.querySelectorAll(".change-right-form").forEach((form) => {
          form.addEventListener("submit", async (ev) => {
            ev.preventDefault();
            const email = (form as HTMLFormElement).dataset.email;
            const right = (form as HTMLFormElement).right.value;
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
                (
                  modal.querySelector("#rights-error") as HTMLElement
                ).textContent = await resp.text();
              } else {
                (
                  modal.querySelector("#rights-error") as HTMLElement
                ).textContent = "Right updated.";
                if (email === user.email) {
                  if (["R", "W", "V", "M", "O"].includes(right)) {
                    user.canvases[id] = right;
                  } else {
                    delete user.canvases[id];
                  }
                  home(pageContent);
                  return;
                }
              }
            } catch (err) {
              (
                modal.querySelector("#rights-error") as HTMLElement
              ).textContent = "Failed to change rights.";
            }
          });
        });
        // Remove right buttons
        modal.querySelectorAll(".remove-right-btn").forEach((btn) => {
          btn.addEventListener("click", async (ev) => {
            const email = (btn as HTMLButtonElement).dataset.email;
            try {
              const resp = await fetch(
                `${__BACKEND_URL__}/api/canvas/${id}/right`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email, right: "" }),
                  credentials: "include",
                }
              );
              if (!resp.ok) {
                (
                  modal.querySelector("#rights-error") as HTMLElement
                ).textContent = await resp.text();
              } else {
                (
                  modal.querySelector("#rights-error") as HTMLElement
                ).textContent = "Right removed.";
                if (email === user.email) {
                  delete user.canvases[id];
                  home(pageContent);
                  return;
                }
                // Re-render rights table
                btn.closest("tr")?.remove();
              }
            } catch (err) {
              (
                modal.querySelector("#rights-error") as HTMLElement
              ).textContent = "Failed to remove right.";
            }
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
              (
                modal.querySelector("#rights-error") as HTMLElement
              ).textContent = await resp.text();
            } else {
              (
                modal.querySelector("#rights-error") as HTMLElement
              ).textContent = "Right added.";
              // Optionally re-fetch rights or update table
              home(pageContent);
            }
          } catch (err) {
            (modal.querySelector("#rights-error") as HTMLElement).textContent =
              "Failed to add right.";
          }
        });
      } catch (err) {
        modal.innerHTML = `<div style="color:red;">Failed to load rights: ${err}</div><button id="close-rights-modal">Close</button>`;
        (modal.querySelector("#close-rights-modal") as HTMLElement).onclick =
          () => {
            modal.style.display = "none";
          };
      }
    });
  });
}
