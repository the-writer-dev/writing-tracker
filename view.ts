import { ItemView, WorkspaceLeaf } from "obsidian";
import { WritingTrackerPlugin } from "./main";
import Chart from "chart.js/auto";

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
  private plugin: WritingTrackerPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: WritingTrackerPlugin) {
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
