export interface WritingTrackerSettings {
	mySetting: string;
	writingGoals: {
		[key: string]: {
			dailyGoal: number;
			totalGoal: number;
			dailyProgress: number;
			totalProgress: number;
			initialWordCount: number;
		};
	};
}

export const DEFAULT_SETTINGS: WritingTrackerSettings = {
	mySetting: "default",
	writingGoals: {},
};
