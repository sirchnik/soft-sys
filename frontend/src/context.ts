type Renderable = {
  render: () => HTMLElement;
};

const TELEPORT = "teleport";

export class Menu {
  private static id = 0;
  private menuEntries: Renderable[];
  private isVisible: boolean;

  constructor(entries: Renderable[] = []) {
    this.menuEntries = entries;
    this.isVisible = false;
  }

  addMenuEntry(entry: Renderable): void {
    this.menuEntries.push(entry);
  }

  show(x: number, y: number): void {
    const container = this.renderMenu();
    container.style.left = `${x}px`;
    container.style.top = `${y}px`;
    container.id = "menu" + Menu.id++;
    const teleportElement = document.getElementById(TELEPORT);
    if (teleportElement) {
      teleportElement.appendChild(container);
    }
    const shadowBox = document.getElementById("shadow-box");
    if (shadowBox) {
      shadowBox.className = "enabled";
      shadowBox.oncontextmenu = (e) => e.preventDefault();
      shadowBox.onclick = () => {
        this.hide();
      };
    }
    this.isVisible = true;
  }

  private renderMenu(): HTMLElement {
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

  hide(): void {
    if (!this.isVisible) return;
    const teleportElement = document.getElementById(TELEPORT);
    if (teleportElement) {
      teleportElement.innerHTML = "";
    }
    const shadowBox = document.getElementById("shadow-box");
    if (shadowBox) {
      shadowBox.className = "";
    }
    this.isVisible = false;
  }
}

export class MenuEntry implements Renderable {
  private name: string;
  private action: () => void;

  constructor(name: string, action: () => void) {
    this.name = name;
    this.action = action;
  }

  render(): HTMLElement {
    const ele = document.createElement("div");
    ele.className = "menu-entry";
    ele.innerText = this.name;
    ele.onclick = () => {
      this.execute();
    };
    return ele;
  }

  execute(): void {
    console.log(`Executing action for ${this.name}`);
    this.action();
  }
}

export class SeparatorEntry implements Renderable {
  render(): HTMLElement {
    const ele = document.createElement("div");
    ele.className = "separator-entry";
    return ele;
  }
}

export class RadioOption implements Renderable {
  private name: string;
  private options: { [key: string]: string };
  private selected: string;
  private onChange: (value: string) => void;

  constructor(
    name: string,
    options: { [key: string]: string },
    selected: string = Object.keys(options)[0],
    onChange: (value: string) => void
  ) {
    this.name = name;
    this.options = options;
    this.selected = selected;
    this.onChange = onChange;
  }

  render(): HTMLElement {
    const container = document.createElement("div");
    container.className = "menu-entry";

    const title = document.createElement("div");
    title.innerText = this.name;
    container.appendChild(title);

    Object.entries(this.options).forEach(([key, label]) => {
      const optionContainer = document.createElement("div");
      optionContainer.style.display = "flex";
      optionContainer.style.alignItems = "center";

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = this.name;
      radio.value = key;
      radio.checked = key === this.selected;
      radio.onchange = () => {
        this.selected = key;
        this.onChange(key);
      };

      const labelElement = document.createElement("label");
      labelElement.innerText = label;
      labelElement.style.marginLeft = "5px";

      optionContainer.appendChild(radio);
      optionContainer.appendChild(labelElement);
      container.appendChild(optionContainer);
    });

    return container;
  }

  setSelected(value: string): void {
    this.selected = value;
  }

  getSelected(): string {
    return this.selected;
  }
}
