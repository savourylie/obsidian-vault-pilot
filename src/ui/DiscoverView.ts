import { ItemView, WorkspaceLeaf } from "obsidian";

export const VIEW_TYPE_DISCOVER = "serendipity-discover-view";

export class DiscoverView extends ItemView {
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE_DISCOVER;
  }

  getDisplayText() {
    return "Discover";
  }

  getIcon() {
    return "lightbulb";
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.createEl("h4", { text: "Discover" });
    container.createEl("p", { text: "Related notes will appear here." });
    console.log("Discover view opened.");
  }

  async onClose() {
    // Nothing to clean up.
    console.log("Discover view closed.");
  }
}