import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'scripts/ui-snapshot',
	outputDir: 'scripts/ui-snapshot/__output__',
	reporter: [['list']],
	use: {
		trace: 'off',
		screenshot: 'only-on-failure'
	},
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
	],
});
