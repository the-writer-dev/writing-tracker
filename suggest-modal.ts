import { App, FuzzySuggestModal } from "obsidian";

export class SuggestModal extends FuzzySuggestModal<string> {
  constructor(
    app: App,
    private items: string[],
  ) {
    super(app);
  }

  getItems(): string[] {
    return this.items;
  }

  getItemText(item: string): string {
    return item;
  }

  onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
    this.close();
    this.onChoose(item);
  }

  onChoose: (item: string) => void;
}
