# Chat System Prompt Template Variables

## Overview

This document describes the approach for implementing dynamic template variables in VaultPilot's chat system prompt. Users can include placeholders like `{{vault_name}}` and `{{current_date_iso}}` in their system prompt templates, which will be automatically replaced with actual values at runtime.

**Key Design Principle**: Template variables remain **visible and editable** in the system prompt textarea. Users see `{{vault_name}}` in settings and can add, remove, or modify variables as they wish. Interpolation happens transparently at runtime when the prompt is actually used.

## Research Findings

### Obsidian API Support

**TL;DR: Obsidian does NOT provide built-in template variable interpolation in plugin settings. We need to implement this ourselves.**

### Available APIs

✅ **Vault Name**: `app.vault.getName()` - Returns vault name as a string
✅ **Current Date**: JavaScript `Date` object - Can format as ISO date
❌ **Default Language**: Not available in Obsidian API - Need to add as plugin setting or use browser locale

### Template Variable Syntax

We'll use a familiar double-curly-brace syntax for template variables:
- `{{current_date_iso}}` - Current date in ISO format (YYYY-MM-DD)
- `{{vault_name}}` - Name of the current vault
- `{{default_language}}` - Default language from plugin settings

This syntax is:
- Recognizable (used by Mustache, Handlebars, etc.)
- Unlikely to conflict with user content
- Easy to document and explain

## Implementation Approach

### 1. Add Template Variable Interpolation Function

Add a helper method in `src/main.ts` (SerendipityPlugin class):

```typescript
/**
 * Interpolate template variables in system prompt.
 * Supported variables:
 * - {{current_date_iso}} - Current date in ISO format (YYYY-MM-DD)
 * - {{vault_name}} - Name of the current vault
 * - {{default_language}} - Default language from settings
 */
private interpolateSystemPrompt(template: string): string {
	const now = new Date();
	const isoDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format
	const vaultName = this.app.vault.getName();
	const language = this.settings.defaultLanguage || 'English';

	return template
		.replace(/\{\{current_date_iso\}\}/g, isoDate)
		.replace(/\{\{vault_name\}\}/g, vaultName)
		.replace(/\{\{default_language\}\}/g, language);
}
```

### 2. Add `defaultLanguage` Plugin Setting

Update `src/main.ts`:

**Interface:**
```typescript
interface SerendipityPluginSettings {
	// ... existing settings
	defaultLanguage: string; // One of: "English", "Spanish", "French", "German", "Chinese", "Japanese", etc.
}
```

**Default:**
```typescript
const DEFAULT_SETTINGS: SerendipityPluginSettings = {
	// ... existing defaults
	defaultLanguage: 'English',
}
```

**Note**: We use a dropdown selector in the UI, but store as a string for flexibility.

### 3. Apply Interpolation When Creating DiscoverView

In `src/main.ts` at line 112 (within `onload()` where DiscoverView is registered):

**Before:**
```typescript
this.registerView(
	VIEW_TYPE_DISCOVER,
	(leaf) => new DiscoverView(
		leaf,
		this.retrievalService,
		this.settings.ollamaUrl,
		this.sessionManager,
		() => this.saveSessions(),
		{
			maxPromptTokens: this.settings.maxPromptTokens,
			reservedResponseTokens: this.settings.reservedResponseTokens,
			recentMessagesToKeep: this.settings.recentMessagesToKeep,
			minRecentMessagesToKeep: this.settings.minRecentMessagesToKeep,
			systemPrompt: this.settings.chatSystemPrompt, // ← Change this line
		},
		this.settings.defaultChatModel,
		this.settings.provider,
		this.settings.lmStudioUrl
	)
);
```

**After:**
```typescript
systemPrompt: this.interpolateSystemPrompt(this.settings.chatSystemPrompt),
```

### 4. Update Settings Tab UI

In `src/main.ts` (SerendipitySettingTab class, Chat tab section):

**Add Default Language Dropdown:**
```typescript
new Setting(container)
	.setName('Default Language')
	.setDesc('Language used in {{default_language}} template variable. The assistant will attempt to reply in this language when appropriate.')
	.addDropdown(dropdown => dropdown
		.addOption('English', 'English')
		.addOption('Spanish', 'Spanish')
		.addOption('French', 'French')
		.addOption('German', 'German')
		.addOption('Italian', 'Italian')
		.addOption('Portuguese', 'Portuguese')
		.addOption('Chinese', 'Chinese (中文)')
		.addOption('Japanese', 'Japanese (日本語)')
		.addOption('Korean', 'Korean (한국어)')
		.addOption('Russian', 'Russian (Русский)')
		.addOption('Arabic', 'Arabic (العربية)')
		.setValue(this.plugin.settings.defaultLanguage)
		.onChange(async (value) => {
			this.plugin.settings.defaultLanguage = value;
			await this.plugin.saveSettings();
		}));
```

**Update System Prompt Description:**
```typescript
new Setting(container)
	.setName('Chat System Prompt')
	.setDesc('Instructions prepended to chat conversations. Supports template variables: ' +
		'{{current_date_iso}}, {{vault_name}}, {{default_language}}. ' +
		'These will be replaced with actual values when the chat starts.');
```

**Add Help Text Below Textarea:**
```typescript
container.createEl('div', {
	cls: 'setting-item-description',
	text: '💡 Template variables like {{vault_name}} will be automatically replaced with real values. ' +
		'You can add, edit, or remove these variables as needed.'
});
```

### 5. Load Template as Default

**Option A: Inline the template content**

Update `DEFAULT_SETTINGS.chatSystemPrompt` in `src/main.ts` to include the full template from `prompts/chat_system_prompt.md`.

**Option B: Keep it simple (recommended for now)**

Keep the current simple default and let users paste the template if they want it. Document the template file in README and provide it as an example.

We'll go with **Option B** for simplicity and to avoid bloating the plugin code.

## Step-by-Step Implementation

### Step 1: Add `defaultLanguage` setting
- Update `SerendipityPluginSettings` interface
- Update `DEFAULT_SETTINGS`
- Add UI field in Chat settings tab

### Step 2: Add interpolation function
- Add `interpolateSystemPrompt()` method to SerendipityPlugin class
- Include JSDoc comments explaining supported variables

### Step 3: Apply interpolation on DiscoverView creation
- Modify line 112 in `main.ts` to call `interpolateSystemPrompt()`

### Step 4: Update settings tab description
- Add template variable documentation to system prompt setting description

### Step 5: Test
- Verify interpolation works with all three variables
- Test edge cases (missing language setting, special characters in vault name)
- Verify backward compatibility (plain text without variables still works)

## Benefits

1. **Transparent**: Users see template variables directly in the settings textarea (WYSIWYG)
2. **User Control**: Users can add, edit, or delete variables freely—no hidden magic
3. **Easy Opt-Out**: Don't want dynamic values? Just delete the `{{markers}}`
4. **Dynamic Values**: Date and vault name always reflect current state
5. **Clear Syntax**: Familiar `{{variable}}` syntax is easy to understand and self-documenting
6. **Backward Compatible**: Plain text without variables continues to work
7. **Language Dropdown**: Provides standard options while maintaining flexibility
8. **No External Dependencies**: Pure TypeScript, no additional libraries needed
9. **Extensible**: Easy to add more variables in the future (e.g., `{{username}}`, `{{note_count}}`)

## Example Usage

### In Settings UI

User sees and edits this system prompt in the textarea:
```
You are VaultPilot, helping with vault "{{vault_name}}".
Today is {{current_date_iso}}.
Respond in {{default_language}} when possible.
```

User selects **"Spanish"** from the Default Language dropdown.

### At Runtime

When the chat starts, VaultPilot internally interpolates to:
```
You are VaultPilot, helping with vault "My Research Notes".
Today is 2025-01-07.
Respond in Spanish when possible.
```

The user **never sees** the interpolated version—it happens transparently in memory.

### User Flexibility

User can customize however they want:
```
# Remove all variables (plain text)
You are a helpful assistant.

# Use only some variables
Current vault: {{vault_name}}

# Add custom context around variables
Today's date is {{current_date_iso}}, and we're working in the "{{vault_name}}" vault.
Please respond in {{default_language}}.
```

## Future Enhancements

Potential additional template variables:
- `{{note_count}}` - Total markdown files in vault
- `{{active_file}}` - Current active file name
- `{{username}}` - System username or user-configured name
- `{{vault_path}}` - Vault directory path
- `{{obsidian_version}}` - Obsidian app version

## References

- Obsidian Vault API: `app.vault.getName()` ([docs.obsidian.md](https://docs.obsidian.md/Reference/TypeScript+API/Vault))
- Template source: `prompts/chat_system_prompt.md`
- Implementation location: `src/main.ts`
