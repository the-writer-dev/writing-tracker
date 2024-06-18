import { App, Modal, Setting } from "obsidian";

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
				btn.setButtonText("Save")
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
