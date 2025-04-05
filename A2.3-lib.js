/**
 * @typedef {Object} Renderable
 * @property {function(): HTMLElement} render
 */

const TELEPORT = "teleport";

export class Menu {
  static #id = 0;
  /**
   * @param {Array<Renderable>} entries
   */
  constructor(entries = []) {
    this.menuEntries = entries;
    this.isVisible = false;
  }

  /**
   * @param {Renderable} entry
   */
  addMenuEntry(entry) {
    this.menuEntries.push(entry);
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  show(x, y) {
    const container = this.#render();
    container.style.className = "menu";
    container.style.left = `${x}px`;
    container.style.top = `${y}px`;
    container.id = "menu" + Menu.#id++;
    document.getElementById(TELEPORT).appendChild(container);
    document.getElementById("shadow-box").className = "enabled";
    document.getElementById("shadow-box").onclick = () => {
      this.hide();
    };
    this.isVisible = true;
  }

  #render() {
    const container = document.createElement("div");
    container.className = "menu-container";

    this.menuEntries.forEach((entry) => {
      const ele = entry.render();
      if (entry instanceof MenuEntry) {
        ele.onclick = () => entry.execute();
      }
      container.appendChild(ele);
    });

    return container;
  }

  hide() {
    if (!this.isVisible) return;
    document.getElementById(TELEPORT).innerHTML = "";
    document.getElementById("shadow-box").className = undefined;
    this.isVisible = false;
  }
}
export class MenuEntry {
  constructor(name, action) {
    this.name = name;
    this.action = action;
  }

  render() {
    const ele = document.createElement("div");
    ele.className = "menu-entry";
    ele.innerText = this.name;
    ele.onclick = () => {
      this.execute();
    };
    return ele;
  }

  execute() {
    console.log(`Executing action for ${this.name}`);
    this.action();
  }
}
export class SeparatorEntry {
  render() {
    const ele = document.createElement("div");
    ele.className = "separator-entry";
    return ele;
  }
}
