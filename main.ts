import Chart from "chart.js/auto";
import { debounce } from "lodash";
import {
  App,
  FuzzySuggestModal,
  ItemView,
  Modal,
  Plugin,
  Setting,
  TAbstractFile,
  TFile,
  WorkspaceLeaf,
} from "obsidian";

export interface WritingTrackerSettings {
  mySetting: string;
  writingGoals: {
    [key: string]: {
      dailyGoal: number;
      totalGoal: number;
      dailyProgress: number;
      totalProgress: number;
      initialWordCount: number;
      previousWordCount?: number;
    };
  };
}

export const DEFAULT_SETTINGS: WritingTrackerSettings = {
  mySetting: "default",
  writingGoals: {},
};
export default class WritingTrakcerPlugin extends Plugin {
  settings: WritingTrackerSettings;

  async onload() {
    await this.loadSettings();

    this.registerView("writing-tracker-view", (leaf) => {
      return new WritingTrackerView(leaf, this);
    });

    this.addCommand({
      id: "open-writing-tracker-view",
      name: "Open Writing Tracker View",
      callback: () => {
        this.activateView();
      },
    });

    this.addCommand({
      id: "clear-all-writing-goals",
      name: "Clear All Writing Goals",
      callback: () => {
        this.clearAllWritingGoals();
      },
    });

    this.addCommand({
      id: "remove-writing-goal",
      name: "Remove Writing Goal",
      callback: async () => {
        const fileOrFolderPath = await this.promptForFileOrFolder();
        if (fileOrFolderPath) {
          await this.removeWritingGoal(fileOrFolderPath);
        }
      },
    });

    // Add the writing goal to the file menu
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        menu.addItem((item) => {
          item
            .setTitle("Set Writing Goals")
            .setIcon("pencil")
            .onClick(async () => {
              this.setWritingGoals(file);
            });
        });
      }),
    );

    // Remove the writing goal from the file menu
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        menu.addItem((item) => {
          item
            .setTitle("Remove Writing Goal")
            .setIcon("cross")
            .onClick(async () => {
              await this.removeWritingGoal(file.path);
            });
        });
      }),
    );

    // Listen to changes in the vault and update word counts
    this.registerEvent(
      this.app.vault.on("modify", (file) => this.updateWordCount(file)),
    );
  }

  async activateView() {
    this.app.workspace.detachLeavesOfType("writing-tracker-view");

    await this.app.workspace.getRightLeaf(false).setViewState({
      type: "writing-tracker-view",
      active: true,
    });
  }

  async setWritingGoals(file: any) {
    const fileOrFolderPath = file.path;

    const modal = new WritingGoalModal(this.app, fileOrFolderPath);
    modal.onClose = async () => {
      if (modal.saved) {
        const { dailyGoal, totalGoal } = modal.getData();
        await this.saveWritingGoals(fileOrFolderPath, dailyGoal, totalGoal);
      }
    };

    modal.open();
  }

  async saveWritingGoals(
    fileOrFolderPath: string,
    dailyGoal: number,
    totalGoal: number,
  ) {
    // Count the number of words in the file or folder before starting the goals
    const abstractFile = this.app.vault.getAbstractFileByPath(fileOrFolderPath);
    const content =
      fileOrFolderPath.endsWith(".md") && abstractFile instanceof TFile
        ? await this.app.vault.read(abstractFile)
        : null;
    const initialWordCount = content ? content.trim().split(/\s+/).length : 0;

    const goals = {
      ...this.settings.writingGoals,
      [fileOrFolderPath]: {
        dailyGoal,
        totalGoal,
        dailyProgress: 0,
        totalProgress: 0,
        initialWordCount,
        previousWordCount: initialWordCount, // Initialize this here
      },
    };
    this.settings.writingGoals = goals;
    await this.saveSettings();
  }

  async clearAllWritingGoals() {
    this.settings.writingGoals = {};
    await this.saveSettings();
  }

  async removeWritingGoal(fileOrFolderPath: string) {
    if (fileOrFolderPath) {
      delete this.settings.writingGoals[fileOrFolderPath];
      await this.saveSettings();
    }
  }

  async promptForFileOrFolder(): Promise<string | null> {
    const allLoadedFiles = this.app.vault.getAllLoadedFiles();
    const folders = allLoadedFiles
      .filter((file) => file.parent && file.parent.path !== "/")
      .map((file) => file.parent.path);

    const fileOrFolderPath = [
      ...new Set(allLoadedFiles.map((file) => file.path).concat(folders)),
    ];
    const selectedPath = await new Promise<string | null>((resolve) => {
      const modal = new SuggestModal(this.app, fileOrFolderPath);
      modal.onChoose = (item) => {
        resolve(item);
      };
      modal.open();
    });
    return selectedPath;
  }

  async updateWordCount(file: TAbstractFile) {
    if (file instanceof TFile) {
      const fileOrFolderPath = file.path;
      const goal = this.settings.writingGoals[fileOrFolderPath];
      if (goal) {
        this.updateWordCountDebounced(file, goal);
      } else {
        const folderPath = file.parent.path;
        const folderGoal = this.settings.writingGoals[folderPath];
        if (folderGoal) {
          this.updateWordCountDebounced(null, folderGoal, folderPath);
        }
      }
    }
  }

  // private updateWordCountDebounced = (
  async updateWordCountDebounced(
    file: TAbstractFile | null,
    goal: any,
    folderPath?: string,
  ) {
    if (file instanceof TFile) {
      const content = await this.app.vault.read(file);
      const currentWordCount =
        content.trim() === "" ? 0 : content.trim().split(/\s+/).length;

      const previousWordCount = goal.previousWordCount || goal.initialWordCount;
      const wordCountChange = currentWordCount - previousWordCount;

      if (folderPath) {
        const filesInFolder = this.app.vault
          .getMarkdownFiles()
          .filter((f) => f.parent.path === folderPath);
        const totalNewWordCount = await Promise.all(
          filesInFolder.map(async (f) => {
            const content = await this.app.vault.read(f);
            const currentWordCount = content.trim().split(/\s+/).length;
            const goalForFile = this.settings.writingGoals[f.path];
            return goalForFile
              ? currentWordCount - goalForFile.initialWordCount
              : 0;
          }),
        );
        const sumNewWordCount = totalNewWordCount.reduce(
          (sum, count) => sum + count,
          0,
        );
        const changeInWordCount = sumNewWordCount - goal.dailyProgress;
        goal.dailyProgress = sumNewWordCount;
        goal.totalProgress += changeInWordCount;
      } else {
        goal.dailyProgress += wordCountChange;
        goal.totalProgress += wordCountChange;
      }

      goal.previousWordCount = currentWordCount;
    }
    await this.saveSettings();
  }
  // },
  //   1000,
  // );

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.onSettingsChanged();
  }

  async onSettingsChanged() {
    this.app.workspace.trigger(
      "writing-tracker-view:settings-changed",
      this.settings.writingGoals,
    );
  }
}

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

export class WritingGoalModal extends Modal {
  saved: boolean;
  dailyGoal: number;
  totalGoal: number;

  constructor(
    app: App,
    public fileOrFolderPath: string,
  ) {
    super(app);
    this.saved = false;
    this.dailyGoal = 0;
    this.totalGoal = 0;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Set Writing Goals" });

    new Setting(contentEl).setName("Daily Goal").addText((text) => {
      text.setValue(this.dailyGoal.toString());
      text.onChange((value) => {
        this.dailyGoal = parseInt(value, 10);
      });
    });

    new Setting(contentEl).setName("Total Goal").addText((text) => {
      text.setValue(this.totalGoal.toString());
      text.onChange((value) => {
        this.totalGoal = parseInt(value, 10);
      });
    });

    new Setting(contentEl)
      .addButton((btn) => {
        btn
          .setButtonText("Save")
          .setCta()
          .onClick(() => {
            this.saved = true;
            this.close();
          });
      })
      .addButton((btn) => {
        btn.setButtonText("Cancel").onClick(() => this.close());
      });
  }

  getData() {
    return {
      dailyGoal: this.dailyGoal,
      totalGoal: this.totalGoal,
    };
  }
}

export class WritingTrackerView extends ItemView {
  private goals: {
    [key: string]: {
      dailyGoal: number;
      totalGoal: number;
      dailyProgress: number;
      totalProgress: number;
      initialWordCount: number;
    };
  } = {};

  private chart: Chart | null = null;
  private plugin: WritingTrakcerPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: WritingTrakcerPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.goals = plugin.settings.writingGoals;

    this.registerEvent(
      this.app.workspace.on(
        "writing-tracker-view:settings-changed",
        this.onSettingsChanged.bind(this),
      ),
    );
  }

  getViewType(): string {
    return "writing-tracker-view";
  }

  getDisplayText(): string {
    return "Writing Tracker";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.createEl("h2", { text: "Writing Tracker" });

    const chartContainer = container.createDiv({ cls: "chart-container" });
    const chartEl = chartContainer.createEl("canvas");
    chartEl.style.width = "400px";
    chartEl.style.height = "400px";

    this.chart = new Chart(chartEl, {
      type: "pie",
      data: {
        labels: Object.keys(this.goals),
        datasets: [
          {
            data: [
              this.getTotalDailyProgress(),
              this.getTotalDailyGoal() - this.getTotalDailyProgress(),
            ],
            backgroundColor: ["#36a2eb", "#e0e0e0"],
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: "top",
          },
          title: {
            display: true,
            text: "Daily Progress",
          },
        },
      },
    });

    const goalsContainer = container.createDiv({
      cls: "writing-goals-container",
    });
    Object.entries(this.goals).forEach(([fileOrFolderPath, goal]) => {
      this.createGoalElement(goalsContainer, fileOrFolderPath, goal);
    });
  }

  private createGoalElement(
    container: HTMLElement,
    fileOrFolderPath: string,
    goal: any,
  ) {
    const goalEl = container.createDiv();
    goalEl.dataset.path = fileOrFolderPath;
    goalEl.createEl("p", { text: fileOrFolderPath });
    goalEl.createEl("p", {
      text: `Daily Goal: ${goal.dailyGoal}, Progress: ${goal.dailyProgress}`,
      cls: "daily-progress",
    });
    goalEl.createEl("p", {
      text: `Total Goal: ${goal.totalGoal}, Progress: ${goal.totalProgress}`,
      cls: "total-progress",
    });
  }

  private updateGoalElement(fileOrFolderPath: string, goal: any) {
    const goalEl = this.containerEl.querySelector(
      `.writing-goals-container [data-path="${fileOrFolderPath}"]`,
    ) as HTMLElement;
    if (goalEl) {
      goalEl.querySelector(".daily-progress").textContent =
        `Daily Goal: ${goal.dailyGoal}, Progress: ${goal.dailyProgress}`;
      goalEl.querySelector(".total-progress").textContent =
        `Total Goal: ${goal.totalGoal}, Progress: ${goal.totalProgress}`;
    }
  }

  private onSettingsChanged(goals: { [key: string]: any }) {
    this.goals = goals;
    Object.entries(this.goals).forEach(([fileOrFolderPath, goal]) => {
      this.updateGoalElement(fileOrFolderPath, goal);
    });
    this.updateChart();
  }

  private updateChart() {
    if (this.chart) {
      this.chart.data.datasets[0].data = [
        this.getTotalDailyProgress(),
        this.getTotalDailyGoal() - this.getTotalDailyProgress(),
      ];
      this.chart.update();
    }
  }

  private getTotalDailyProgress(): number {
    return Object.values(this.goals).reduce(
      (total, goal) => total + goal.dailyProgress,
      0,
    );
  }

  private getTotalDailyGoal(): number {
    return Object.values(this.goals).reduce(
      (total, goal) => total + goal.dailyGoal,
      0,
    );
  }
}
