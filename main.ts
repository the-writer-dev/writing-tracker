import { debounce } from "lodash";
import { Plugin, TAbstractFile, TFile } from "obsidian";
import { WritingGoalModal } from "./modal";
import { DEFAULT_SETTINGS, WritingTrackerSettings } from "./settings";
import { SuggestModal } from "./suggest-modal";
import { WritingTrackerView } from "./view";

export class WritingTrackerPlugin extends Plugin {
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

  private updateWordCountDebounced = debounce(
    async (file: TAbstractFile | null, goal: any, folderPath?: string) => {
      if (file instanceof TFile) {
        const content = await this.app.vault.read(file);
        const currentWordCount = content.trim().split(/\s+/).length;
        const newWordCount = currentWordCount - goal.initialWordCount;

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
          goal.dailyProgress = sumNewWordCount;
          goal.totalProgress += sumNewWordCount;
        } else {
          goal.dailyProgress = newWordCount;
          goal.totalProgress += newWordCount;
        }
      }
      await this.saveSettings();
    },
    2000,
  );

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
