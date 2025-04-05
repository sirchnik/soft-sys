import { Menu, MenuEntry, SeparatorEntry } from "./A2.3-lib.js";

function displayMenu() {
  const entries = [
    new MenuEntry("Funny", () => {
      console.log("Funny action executed");
    }),
    new MenuEntry("Funny 2", () => {
      console.log("Funny 2 action executed");
    }),
  ];
  const menu = new Menu(entries);
  menu.addMenuEntry(new SeparatorEntry());
  menu.addMenuEntry(
    new MenuEntry("Funny 2", () => {
      console.log("Funny 2 action executed");
    })
  );
  menu.show(300, 300);
}

globalThis.displayMenu = displayMenu;
