import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('VaultPilot chat UI snapshot', () => {
  test('renders chat input and send button', async ({ page }) => {
    const file = path.resolve(__dirname, 'preview.html');
    await page.goto('file://' + file.replace(/\\/g, '/'));
    const chat = page.locator('#chat');
    await expect(chat).toBeVisible();
    // Take a screenshot of just the chat bar area
    const shot = await chat.screenshot();
    expect(shot.byteLength).toBeGreaterThan(1000);
    const outDir = path.resolve(__dirname, '__screenshots__');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, 'chat-light.png');
    fs.writeFileSync(outFile, shot);
  });
});
