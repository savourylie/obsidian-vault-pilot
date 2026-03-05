import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  MarkdownView,
  Notice,
  Editor,
  TFile,
  EditorPosition,
  requestUrl,
} from "obsidian";
import { DiscoverView, VIEW_TYPE_DISCOVER } from "./ui/DiscoverView";
import {
  IndexingService,
  AnySerializedIndex,
} from "./services/IndexingService";
import { RetrievalService } from "./services/RetrievalService";
import { EditModal } from "./ui/EditModal";
import { TagSuggestionModal } from "./ui/TagSuggestionModal";
import {
  suggestTags,
  extractInlineTags,
  extractFrontmatterTags,
  mergeTagsIntoContent,
} from "./services/TaggingService";
import { SuggestionCallout } from "./ui/SuggestionCallout";
import { createAdapter } from "./llm/adapterFactory";
import { ContextAssembler } from "./services/ContextAssembler";
import { SessionManager } from "./services/SessionManager";
import { ChatSessionsData } from "./types/chat";
import type { LLMProfile, LLMProvider } from "./types/llm";
import { createTabs, Tabs } from "./ui/SettingsTabs";
import { UnsavedChangesModal } from "./ui/UnsavedChangesModal";

interface QuickActionsConfig {
  rewrite: string;
  tighten: string;
  expand: string;
  grammar: string;
  translate: string;
}

interface SerendipityPluginSettings {
  provider: LLMProvider;
  ollamaUrl: string;
  lmStudioUrl: string;
  openAIUrl: string;
  openAIApiKey: string;
  openAITemperature?: number;
  llmProfiles: LLMProfile[];
  activeLLMProfileId: string;
  maxPromptTokens: number;
  reservedResponseTokens: number;
  recentMessagesToKeep: number;
  minRecentMessagesToKeep: number;
  quickActions: QuickActionsConfig;
  inlineEditSystemPrompt: string;
  chatSystemPrompt: string;
  defaultChatModel: string;
  defaultEditModel: string;
  defaultLanguage: string;
  // Tag suggestion settings (Ticket 39)
  tagSuggestions?: {
    useLLM: boolean;
    min: number;
    max: number;
    confirmBeforeInsert: boolean;
    modelOverride: string; // empty = use defaultChatModel
  };
}

const DEFAULT_SETTINGS: SerendipityPluginSettings = {
  provider: "ollama",
  ollamaUrl: "http://localhost:11434",
  lmStudioUrl: "http://localhost:1234",
  openAIUrl: "http://localhost:8080",
  openAIApiKey: "",
  openAITemperature: undefined,
  llmProfiles: [],
  activeLLMProfileId: "",
  maxPromptTokens: 16384,
  reservedResponseTokens: 2048,
  recentMessagesToKeep: 6,
  minRecentMessagesToKeep: 2,
  quickActions: {
    rewrite: "Rewrite this text to be clearer and more engaging.",
    tighten: "Make this text more concise while preserving key information.",
    expand: "Expand this text with more detail and examples.",
    grammar: "Fix grammar, spelling, and punctuation errors.",
    translate: "Translate this text to Spanish.",
  },
  inlineEditSystemPrompt:
    'You are an AI writing assistant for Obsidian. When editing text, output ONLY the revised content without code fences (```), quotes ("""), or explanations. Match the original\'s language, tone, and markdown formatting.',
  chatSystemPrompt: `You are VaultPilot, an Obsidian-aware writing and research assistant that chats with the user about their notes.

CURRENT_DATE: {{current_date_iso}}
VAULT_NAME: {{vault_name}}
DEFAULT_LANGUAGE: {{default_language}} # e.g., "English". Reply in the user's last message language when possible.

# Identity & Ethos

- Be warm, direct, and honest. Avoid flattery. Prefer clear, concise answers.
- Prioritize accuracy grounded in the user's Obsidian vault. If something isn't in the vault or you're unsure, say so.

# What "Obsidian-aware" Means

- You understand Obsidian markdown conventions:
  - Wikilinks: [[Note Title]] (and [[Note Title#Heading]] / [[Note Title#^blockid]])
  - YAML frontmatter: preserve exactly unless explicitly asked to change
  - Tags: #tag, block refs ^blockid, callouts/admonitions, footnotes [^1], code fences, tables
- When proposing edits, output valid Markdown compatible with Obsidian. Never inject raw HTML unless requested.

# Safety & Privacy

- Never fabricate citations. If you cannot find something in the vault, say "not found".

# Conversational Goals

- Help the user think, write, refactor, summarize, compare, outline, and plan using the notes they already have.
- Offer structure: headings, bullet points, checklists, tables. Use short sections and scannable formatting.
- If the user's question is ambiguous but answerable from context, make a best effort and state assumptions, or ask for clarification.
- If the user's question is unanswerable from the vault, say so and suggest next

# Citations & Grounding

- When an answer references specific notes, cite them inline with wikilinks. Prefer heading or block anchors when helpful.
  Examples:
  - See [[Project Plan#Milestones]]
  - Source: [[Zettels/2025-03-12 Thinking on X#^abc123]]
- When quoting, quote minimally and faithfully. Use block quotes (>) for multi-line excerpts.

# Style & Tone

- Match the user's language and register. If the note is technical, keep it precise; if reflective, keep it gentle.
- Avoid purple prose. Prefer simple, information-dense sentences.
- For long answers, lead with a 1–3 sentence summary, then details.

# Long Documents & RAG-like Behavior

- If a note is long, read strategically (headings, summaries, key sections) instead of naively reading all content.
- Use iterative retrieval: search → skim relevant notes → cite and answer → (optionally) deepen with follow-up retrieval.
- De-duplicate across notes; when merging ideas, acknowledge conflicts explicitly.

# Tasks You Excel At

- Summarize a note or a set of notes with key points and action items.
- Create outlines, compare documents, extract entities/dates/refs, build glossaries.
- Turn highlights/quotes into synthesis and next steps.
- Generate study questions or writing prompts grounded in the cited notes.
- Draft refactors: clearer headings, tables, and callouts (without changing meaning).

# Things You Must Not Do

- Don't invent content about the vault. Don't claim you "opened" or "edited" a file unless a write tool was actually used.
- Don't break code blocks or math.

Guidelines:

- Keep search queries specific (include key phrases and note names when known).
- When many results exist, rank by: (a) exact title/heading match, (b) recency if relevant, (c) backlink centrality.
- Avoid reading entire files if headings/anchors suffice.

# Output Formats (choose what fits the task)

- "Direct answer": concise, with wikilink citations.
- "Mini-brief": **Summary**, **Evidence (links/anchors)**, **Next actions**.
- "Patch plan": bullet list of intended changes + full Markdown patch.
- "Outline": hierarchical headings, then TODO checklist.

# Math, Code, and Tables

- Use fenced code blocks with language tags. Keep math in $…$ or $$…$$. Keep tables Obsidian-compatible (pipes).
- Never backtick-wrap wikilinks unless inside code.

# If Information Is Missing

- Say what's missing and offer a small set of targeted next steps (e.g., "search terms I can run" or "notes to open").
- Do not pester the user with questions; make one best-effort assumption and continue.

# Session Memory (ephemeral)

- Remember user choices for this chat only: preferred language, summary length, and whether edits may be auto-applied.
- Reset politely if the user says "reset" or starts a new topic.

Acknowledge requests, act safely, ground answers in the vault with wikilink citations, and keep edits opt-in by default.`,
  defaultChatModel: "gemma3n:e2b",
  defaultEditModel: "gemma3n:e2b",
  defaultLanguage: "English",
  tagSuggestions: {
    useLLM: true,
    min: 3,
    max: 5,
    confirmBeforeInsert: true,
    modelOverride: "",
  },
};

function makeLLMProfileId() {
  return `llm-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function getImportedProfileName(provider: LLMProvider) {
  if (provider === "lmstudio") return "Imported (LM Studio)";
  if (provider === "openai") return "Imported (OpenAI-compatible)";
  return "Imported (Ollama)";
}

function cloneLLMProfile(profile: LLMProfile): LLMProfile {
  return {
    ...profile,
  };
}

function createLLMProfileFromSettings(
  settings: Pick<
    SerendipityPluginSettings,
    | "provider"
    | "ollamaUrl"
    | "lmStudioUrl"
    | "openAIUrl"
    | "openAIApiKey"
    | "openAITemperature"
    | "defaultChatModel"
    | "defaultEditModel"
  >,
  overrides?: Partial<LLMProfile>
): LLMProfile {
  const provider =
    overrides?.provider === "lmstudio" || overrides?.provider === "openai"
      ? overrides.provider
      : settings.provider === "lmstudio" || settings.provider === "openai"
      ? settings.provider
      : "ollama";
  return {
    id: overrides?.id || makeLLMProfileId(),
    name: overrides?.name || getImportedProfileName(provider),
    provider,
    ollamaUrl: overrides?.ollamaUrl ?? settings.ollamaUrl ?? DEFAULT_SETTINGS.ollamaUrl,
    lmStudioUrl:
      overrides?.lmStudioUrl ?? settings.lmStudioUrl ?? DEFAULT_SETTINGS.lmStudioUrl,
    openAIUrl: overrides?.openAIUrl ?? settings.openAIUrl ?? DEFAULT_SETTINGS.openAIUrl,
    openAIApiKey:
      overrides?.openAIApiKey ?? settings.openAIApiKey ?? DEFAULT_SETTINGS.openAIApiKey,
    openAITemperature:
      overrides?.openAITemperature !== undefined
        ? overrides.openAITemperature
        : settings.openAITemperature,
    defaultChatModel:
      overrides?.defaultChatModel ??
      settings.defaultChatModel ??
      DEFAULT_SETTINGS.defaultChatModel,
    defaultEditModel:
      overrides?.defaultEditModel ??
      settings.defaultEditModel ??
      DEFAULT_SETTINGS.defaultEditModel,
  };
}

function normalizeLLMProfile(
  profile: Partial<LLMProfile> | undefined,
  index: number
): LLMProfile {
  const provider =
    profile?.provider === "lmstudio" || profile?.provider === "openai"
      ? profile.provider
      : "ollama";
  const normalized = createLLMProfileFromSettings(DEFAULT_SETTINGS, {
    id:
      typeof profile?.id === "string" && profile.id.trim()
        ? profile.id.trim()
        : makeLLMProfileId(),
    name:
      typeof profile?.name === "string" && profile.name.trim()
        ? profile.name.trim()
        : `Profile ${index + 1}`,
    provider,
    ollamaUrl:
      typeof profile?.ollamaUrl === "string"
        ? profile.ollamaUrl
        : DEFAULT_SETTINGS.ollamaUrl,
    lmStudioUrl:
      typeof profile?.lmStudioUrl === "string"
        ? profile.lmStudioUrl
        : DEFAULT_SETTINGS.lmStudioUrl,
    openAIUrl:
      typeof profile?.openAIUrl === "string"
        ? profile.openAIUrl
        : DEFAULT_SETTINGS.openAIUrl,
    openAIApiKey:
      typeof profile?.openAIApiKey === "string" ? profile.openAIApiKey : "",
    openAITemperature:
      typeof profile?.openAITemperature === "number"
        ? profile.openAITemperature
        : undefined,
    defaultChatModel:
      typeof profile?.defaultChatModel === "string" && profile.defaultChatModel
        ? profile.defaultChatModel
        : DEFAULT_SETTINGS.defaultChatModel,
    defaultEditModel:
      typeof profile?.defaultEditModel === "string" && profile.defaultEditModel
        ? profile.defaultEditModel
        : DEFAULT_SETTINGS.defaultEditModel,
  });
  return normalized;
}

function normalizeUniqueProfileName(
  name: string,
  profiles: LLMProfile[],
  currentId?: string
) {
  const trimmed = name.trim();
  const baseName = trimmed || `Profile ${profiles.length + 1}`;
  const used = new Set(
    profiles
      .filter((profile) => profile.id !== currentId)
      .map((profile) => profile.name.trim())
      .filter(Boolean)
  );
  if (!used.has(baseName)) return baseName;
  let suffix = 2;
  while (used.has(`${baseName} (${suffix})`)) {
    suffix += 1;
  }
  return `${baseName} (${suffix})`;
}

const OLLAMA_FALLBACK_MODELS = ["gemma3n:e2b", "llama3.1:8b", "qwen2.5:7b"];

const STATIC_MODEL_GROUPS: Array<{ label: string; models: string[] }> = [
  {
    label: "OpenAI",
    models: ["gpt-5-chat-latest", "gpt-5-mini", "gpt-5-nano"],
  },
  {
    label: "Gemini",
    models: ["gemini-2.5-pro", "gemini-2.5-pro", "gemini-2.5-flash-lite"],
  },
  {
    label: "xAI",
    models: ["grok-4", "grok-4-fast", "grok-code-fast-1", "grok-3-mini"],
  },
  {
    label: "Qwen",
    models: ["qwen3-max", "qwen-plus"],
  },
];

const STATIC_MODEL_LIST = Array.from(
  new Set(STATIC_MODEL_GROUPS.flatMap((group) => group.models))
);

export default class SerendipityPlugin extends Plugin {
  settings: SerendipityPluginSettings;
  private dataBlob: any | undefined;
  indexingService: IndexingService;
  retrievalService: RetrievalService;
  sessionManager: SessionManager;

  async onload() {
    await this.loadSettings();

    // Init services
    this.indexingService = new IndexingService(this.app);
    this.retrievalService = new RetrievalService(
      this.app,
      this.indexingService
    );

    // Load persisted index (if present)
    const persistedIndex = this.dataBlob?.index as
      | AnySerializedIndex
      | undefined;
    if (persistedIndex) {
      this.indexingService.load(persistedIndex);
    }

    // Init session manager with persisted sessions
    const persistedSessions = this.dataBlob?.chatSessions as
      | ChatSessionsData
      | undefined;
    this.sessionManager = new SessionManager(persistedSessions);

    // Register the Discover View
    this.registerView(VIEW_TYPE_DISCOVER, (leaf) => {
      console.log("VaultPilot: Creating DiscoverView instance");
      console.log(
        "VaultPilot: Raw chatSystemPrompt (first 200 chars):",
        this.settings.chatSystemPrompt.slice(0, 200)
      );

      const interpolatedPrompt = this.interpolateSystemPrompt(
        this.settings.chatSystemPrompt
      );
      console.log(
        "VaultPilot: Interpolated systemPrompt will be passed to ChatService"
      );

      return new DiscoverView(
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
          systemPrompt: interpolatedPrompt,
        },
        this.settings.defaultChatModel,
        this.settings.provider,
        this.settings.lmStudioUrl,
        this.settings.openAIUrl,
        this.settings.openAIApiKey,
        this.settings.openAITemperature,
        this.settings.activeLLMProfileId,
        async (model: string) => {
          await this.updateActiveProfileDefaultChatModel(model);
        }
      );
    });

    // Add a ribbon icon for quick access (chat-style icon)
    this.addRibbonIcon(
      "message-circle",
      "VaultPilot: Toggle Discover Panel",
      () => {
        this.toggleDiscoverView();
      }
    );

    // Add command to toggle the Discover view
    this.addCommand({
      id: "toggle-discover-panel",
      name: "Toggle Discover Panel",
      callback: () => {
        this.toggleDiscoverView();
      },
    });

    // Add command to rebuild the local index
    this.addCommand({
      id: "reindex-vault",
      name: "Reindex Vault",
      callback: async () => {
        console.log("VaultPilot: Reindex started");
        await this.indexingService.buildIndex();
        await this.saveIndex();
        console.log("VaultPilot: Reindex complete");
      },
    });

    // Add command for inline AI editing
    this.addCommand({
      id: "ai-edit-selection",
      name: "Edit selection with AI",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "e" }],
      callback: () => {
        console.log("VaultPilot: ai-edit-selection command triggered");
        this.handleAIEdit();
      },
    });
    console.log("VaultPilot: ai-edit-selection command registered");

    // Add command: Suggest Hashtags for Current Note
    this.addCommand({
      id: "suggest-hashtags-current-note",
      name: "Suggest Hashtags for Current Note",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "h" }],
      callback: async () => {
        console.log("VaultPilot: suggest-hashtags command triggered");
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) {
          new Notice("No active note found");
          console.warn(
            "VaultPilot: No active MarkdownView when suggesting hashtags"
          );
          return;
        }
        const editor = view.editor;
        const content = editor.getValue();
        console.log("VaultPilot: Note content length =", content?.length ?? 0);
        const existing = new Set<string>([
          ...extractInlineTags(content),
          ...extractFrontmatterTags(content),
        ]);
        console.log("VaultPilot: Existing tags found =", Array.from(existing));

        const ts = this.settings.tagSuggestions || {
          useLLM: true,
          min: 3,
          max: 5,
          confirmBeforeInsert: true,
          modelOverride: "",
        };
        const min = Math.max(1, ts.min || 3);
        const max = Math.max(min, ts.max || 5);
        const model =
          ts.modelOverride && ts.modelOverride.trim()
            ? ts.modelOverride.trim()
            : this.settings.defaultChatModel;
        const useLLM = ts.useLLM !== false;

        let suggestions: string[] = [];
        try {
          const adapter = createAdapter({
            provider: this.settings.provider || "ollama",
            ollamaUrl: this.settings.ollamaUrl,
            lmStudioUrl: this.settings.lmStudioUrl,
            openAIUrl: this.settings.openAIUrl,
            openAIApiKey: this.settings.openAIApiKey,
            openAITemperature: this.settings.openAITemperature,
            defaultModel: model,
          });
          suggestions = await suggestTags(
            this.app,
            content,
            {
              useLLM,
              ollamaUrl: this.settings.ollamaUrl,
              model,
              minSuggestions: min,
              maxSuggestions: max,
              indexStats: this.indexingService,
              llmAdapter: adapter,
            },
            existing
          );
          console.log("VaultPilot: Suggestions returned =", suggestions);
        } catch (err) {
          console.error("VaultPilot: suggestTags error", err);
          if (useLLM) {
            const provider = this.settings.provider || "ollama";
            const base =
              provider === "lmstudio"
                ? "Could not connect to LM Studio. Using local fallback."
                : provider === "openai"
                ? "Could not connect to the OpenAI-compatible server. Using local fallback."
                : "Could not connect to Ollama. Using local fallback.";
            new Notice(`⚠️ ${base}`);
          }
        }

        if (!suggestions || suggestions.length === 0) {
          new Notice("No tag suggestions found");
          console.warn("VaultPilot: No suggestions generated");
          return;
        }

        if (ts.confirmBeforeInsert !== false) {
          console.log(
            "VaultPilot: Opening TagSuggestionModal with",
            suggestions.length,
            "items"
          );
          new TagSuggestionModal(this.app, {
            suggestions,
            onConfirm: (selected) => {
              console.log(
                "VaultPilot: Modal confirmed with selected tags =",
                selected
              );
              if (!selected || selected.length === 0) return;
              const latest = editor.getValue();
              const res = mergeTagsIntoContent(latest, selected);
              console.log(
                "VaultPilot: mergeTagsIntoContent changed =",
                res.changed
              );
              if (!res.changed) {
                new Notice("No new tags to insert");
                console.log(
                  "VaultPilot: Nothing new to insert (all tags already present)"
                );
                return;
              }
              editor.setValue(res.content);
              new Notice(`Inserted tags: ${selected.join(" ")}`);
              console.log("VaultPilot: Inserted tags successfully");
            },
          }).open();
        } else {
          console.log(
            "VaultPilot: Quick insert path (no confirm) with",
            suggestions.length,
            "tags"
          );
          const latest = editor.getValue();
          const res = mergeTagsIntoContent(latest, suggestions);
          if (!res.changed) {
            new Notice("No new tags to insert");
            return;
          }
          editor.setValue(res.content);
          new Notice(`Inserted tags: ${suggestions.join(" ")}`);
        }
      },
    });

    // Wire vault + metadata events for incremental updates
    this.registerEvent(
      this.app.vault.on("create", async (file: any) => {
        if (file?.extension !== "md") return;
        await this.indexingService.updateIndex(file);
        await this.saveIndex();
      })
    );
    this.registerEvent(
      this.app.vault.on("modify", async (file: any) => {
        if (file?.extension !== "md") return;
        await this.indexingService.updateIndex(file);
        await this.saveIndex();
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", async (file: any) => {
        if (!file) return;
        this.indexingService.removeFromIndex(file);
        await this.saveIndex();

        // Remove deleted file from all session context files
        this.sessionManager.deleteContextFile(file.path);
        await this.saveSessions();

        // Refresh chips in all open DiscoverViews
        this.refreshAllDiscoverViewChips();
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", async (file: any, oldPath: string) => {
        if (oldPath) {
          this.indexingService.removeFromIndex(oldPath);

          // Update context file paths in all sessions
          this.sessionManager.renameContextFile(oldPath, file.path);
          await this.saveSessions();

          // Refresh chips in all open DiscoverViews
          this.refreshAllDiscoverViewChips();
        }
        if (file?.extension === "md") {
          await this.indexingService.updateIndex(file);
          await this.saveIndex();
        }
      })
    );
    this.registerEvent(
      (this.app.metadataCache as any).on?.("changed", async (file: any) => {
        if (file?.extension !== "md") return;
        await this.indexingService.updateIndex(file);
        await this.saveIndex();
      })
    );

    // Register file-menu event for "Add to Assistant Context"
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        // Only show for markdown files
        if (!file || (file as TFile).extension !== "md") {
          return;
        }

        menu.addItem((item) => {
          item
            .setTitle("Add to Assistant Context")
            .setIcon("plus-circle")
            .onClick(async () => {
              await this.handleAddToContext(file as TFile);
            });
        });
      })
    );

    // Add the settings tab
    this.addSettingTab(new SerendipitySettingTab(this.app, this));

    console.log("VaultPilot plugin loaded.");
  }

  onunload() {
    console.log("VaultPilot plugin unloaded.");
  }

  async loadSettings() {
    const blob = await this.loadData();
    this.dataBlob = blob || {};
    const loadedSettings =
      blob && (blob as any).settings ? (blob as any).settings : blob;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedSettings || {});
    let didChange = false;
    const legacySnapshot = JSON.stringify({
      provider: this.settings.provider,
      ollamaUrl: this.settings.ollamaUrl,
      lmStudioUrl: this.settings.lmStudioUrl,
      openAIUrl: this.settings.openAIUrl,
      openAIApiKey: this.settings.openAIApiKey,
      openAITemperature: this.settings.openAITemperature,
      defaultChatModel: this.settings.defaultChatModel,
      defaultEditModel: this.settings.defaultEditModel,
    });
    let profiles = Array.isArray(this.settings.llmProfiles)
      ? this.settings.llmProfiles.map((profile: any, index: number) =>
          normalizeLLMProfile(profile, index)
        )
      : [];

    if (profiles.length === 0) {
      profiles = [
        createLLMProfileFromSettings(this.settings, {
          name: getImportedProfileName(this.settings.provider || "ollama"),
        }),
      ];
      didChange = true;
    }

    const normalizedProfiles: LLMProfile[] = [];
    for (let index = 0; index < profiles.length; index += 1) {
      const profile = profiles[index];
      const existingBefore = normalizedProfiles.map((item) => item.name);
      const normalizedName = normalizeUniqueProfileName(profile.name, normalizedProfiles);
      if (
        normalizedName !== profile.name ||
        existingBefore.includes(normalizedName)
      ) {
        didChange = true;
      }
      normalizedProfiles.push({
        ...profile,
        name: normalizedName || `Profile ${index + 1}`,
      });
    }
    profiles = normalizedProfiles;

    this.settings.llmProfiles = profiles;
    if (
      !this.settings.activeLLMProfileId ||
      !profiles.some((profile) => profile.id === this.settings.activeLLMProfileId)
    ) {
      this.settings.activeLLMProfileId = profiles[0].id;
      didChange = true;
    }

    this.applyActiveLLMProfileToLegacySettings();
    if (
      JSON.stringify({
        provider: this.settings.provider,
        ollamaUrl: this.settings.ollamaUrl,
        lmStudioUrl: this.settings.lmStudioUrl,
        openAIUrl: this.settings.openAIUrl,
        openAIApiKey: this.settings.openAIApiKey,
        openAITemperature: this.settings.openAITemperature,
        defaultChatModel: this.settings.defaultChatModel,
        defaultEditModel: this.settings.defaultEditModel,
      }) !== legacySnapshot
    ) {
      didChange = true;
    }
    if (didChange) {
      await this.saveSettings();
    }
  }

  async saveSettings() {
    this.dataBlob = this.dataBlob || {};
    (this.dataBlob as any).settings = this.settings;
    await this.saveData(this.dataBlob);
  }

  getActiveLLMProfile(): LLMProfile {
    const profiles = this.settings.llmProfiles || [];
    const active =
      profiles.find((profile) => profile.id === this.settings.activeLLMProfileId) ||
      profiles[0];
    if (active) return cloneLLMProfile(active);
    return createLLMProfileFromSettings(this.settings);
  }

  private applyActiveLLMProfileToLegacySettings() {
    const active = this.getActiveLLMProfile();
    this.settings.provider = active.provider;
    this.settings.ollamaUrl = active.ollamaUrl;
    this.settings.lmStudioUrl = active.lmStudioUrl;
    this.settings.openAIUrl = active.openAIUrl;
    this.settings.openAIApiKey = active.openAIApiKey;
    this.settings.openAITemperature = active.openAITemperature;
    this.settings.defaultChatModel = active.defaultChatModel;
    this.settings.defaultEditModel = active.defaultEditModel;
  }

  async setActiveLLMProfile(profileId: string): Promise<void> {
    const profile = (this.settings.llmProfiles || []).find(
      (item) => item.id === profileId
    );
    if (!profile) return;
    this.settings.activeLLMProfileId = profile.id;
    this.applyActiveLLMProfileToLegacySettings();
    await this.saveSettings();
    this.refreshAllDiscoverViewProviderSettings();
  }

  async saveLLMProfile(profile: LLMProfile): Promise<void> {
    const existing = this.settings.llmProfiles || [];
    const normalizedName = normalizeUniqueProfileName(profile.name, existing, profile.id);
    const normalized = normalizeLLMProfile(
      {
        ...profile,
        name: normalizedName,
      },
      Math.max(
        0,
        existing.findIndex((item) => item.id === profile.id)
      )
    );
    let updated = false;
    this.settings.llmProfiles = existing.map((item) => {
      if (item.id !== profile.id) return item;
      updated = true;
      return normalized;
    });
    if (!updated) {
      this.settings.llmProfiles = [...existing, normalized];
    }
    this.settings.activeLLMProfileId = normalized.id;
    this.applyActiveLLMProfileToLegacySettings();
    await this.saveSettings();
    this.refreshAllDiscoverViewProviderSettings();
  }

  async saveLLMProfileAsNew(profileDraft: LLMProfile): Promise<LLMProfile> {
    const existing = this.settings.llmProfiles || [];
    const created = normalizeLLMProfile(
      {
        ...profileDraft,
        id: makeLLMProfileId(),
        name: normalizeUniqueProfileName(profileDraft.name, existing),
      },
      existing.length
    );
    this.settings.llmProfiles = [...existing, created];
    this.settings.activeLLMProfileId = created.id;
    this.applyActiveLLMProfileToLegacySettings();
    await this.saveSettings();
    this.refreshAllDiscoverViewProviderSettings();
    return cloneLLMProfile(created);
  }

  async deleteLLMProfile(profileId: string): Promise<void> {
    const existing = this.settings.llmProfiles || [];
    if (existing.length <= 1) return;
    const nextProfiles = existing.filter((profile) => profile.id !== profileId);
    if (nextProfiles.length === existing.length) return;
    this.settings.llmProfiles = nextProfiles;
    if (this.settings.activeLLMProfileId === profileId) {
      this.settings.activeLLMProfileId = nextProfiles[0].id;
    }
    this.applyActiveLLMProfileToLegacySettings();
    await this.saveSettings();
    this.refreshAllDiscoverViewProviderSettings();
  }

  async updateActiveProfileDefaultChatModel(model: string): Promise<void> {
    const active = this.getActiveLLMProfile();
    active.defaultChatModel = model || active.defaultChatModel;
    await this.saveLLMProfile(active);
  }

  private async saveIndex() {
    this.dataBlob = this.dataBlob || {};
    (this.dataBlob as any).index = this.indexingService.export();
    await this.saveData(this.dataBlob);
  }

  async saveSessions() {
    this.dataBlob = this.dataBlob || {};
    (this.dataBlob as any).chatSessions = this.sessionManager.export();
    await this.saveData(this.dataBlob);
  }

  /**
   * Interpolate template variables in system prompt.
   * Supported variables:
   * - {{current_date_iso}} - Current date in ISO format (YYYY-MM-DD)
   * - {{vault_name}} - Name of the current vault
   * - {{default_language}} - Default language from settings
   */
  private interpolateSystemPrompt(template: string): string {
    console.log("VaultPilot: interpolateSystemPrompt called");
    console.log(
      "VaultPilot: Input template (first 200 chars):",
      template.slice(0, 200)
    );

    const now = new Date();
    const isoDate = now.toISOString().split("T")[0]; // YYYY-MM-DD format
    const vaultName = this.app.vault.getName();
    const language = this.settings.defaultLanguage || "English";

    console.log("VaultPilot: Interpolation values:");
    console.log("  - current_date_iso:", isoDate);
    console.log("  - vault_name:", vaultName);
    console.log("  - default_language:", language);

    const result = template
      .replace(/\{\{current_date_iso\}\}/g, isoDate)
      .replace(/\{\{vault_name\}\}/g, vaultName)
      .replace(/\{\{default_language\}\}/g, language);

    console.log(
      "VaultPilot: Output result (first 200 chars):",
      result.slice(0, 200)
    );

    return result;
  }

  async toggleDiscoverView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_DISCOVER);
    if (existing.length > 0) {
      this.app.workspace.detachLeavesOfType(VIEW_TYPE_DISCOVER);
      return;
    }

    let rightLeaf = this.app.workspace.getRightLeaf(false);
    if (!rightLeaf) {
      // Ensure a right sidebar leaf exists in fresh sessions
      rightLeaf = this.app.workspace.getRightLeaf(true);
    }

    await rightLeaf.setViewState({
      type: VIEW_TYPE_DISCOVER,
      active: true,
    });

    this.app.workspace.revealLeaf(
      this.app.workspace.getLeavesOfType(VIEW_TYPE_DISCOVER)[0]
    );
  }

  async handleAddToContext(file: TFile) {
    // Get active DiscoverView
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DISCOVER);
    if (leaves.length === 0) {
      new Notice(
        "Please open the Discover panel first (VaultPilot icon in sidebar)"
      );
      return;
    }

    const discoverView = leaves[0].view as DiscoverView;
    if (!discoverView) {
      new Notice("Could not access Discover view");
      return;
    }

    // Get active session
    const activeSession = this.sessionManager.getActiveSession();
    if (!activeSession) {
      new Notice("No active chat session");
      return;
    }

    // Add file to context
    this.sessionManager.addContextFiles(activeSession.id, [file.path]);
    await this.saveSessions();

    // Refresh UI to show the chip immediately
    discoverView.refreshContextChips();

    new Notice(`Added "${file.basename}" to chat context`);
    console.log(
      `VaultPilot: Added ${file.path} to session ${activeSession.id}`
    );
  }

  /**
   * Refresh context chips in all open DiscoverView instances.
   */
  private refreshAllDiscoverViewChips() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DISCOVER);
    for (const leaf of leaves) {
      const view = leaf.view as DiscoverView;
      if (view && view.refreshContextChips) {
        view.refreshContextChips();
      }
    }
  }

  /**
   * Update provider settings in all open DiscoverView instances.
   * Called when LLM provider or base URLs change in settings.
   */
  private refreshAllDiscoverViewProviderSettings() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DISCOVER);
    for (const leaf of leaves) {
      const view = leaf.view as DiscoverView;
      if (view && view.updateProviderSettings) {
        view.updateProviderSettings(
          this.settings.provider,
          this.settings.ollamaUrl,
          this.settings.lmStudioUrl,
          this.settings.openAIUrl,
          this.settings.openAIApiKey,
          this.settings.openAITemperature,
          this.settings.defaultChatModel,
          this.settings.activeLLMProfileId
        );
      }
    }
  }

  handleAIEdit() {
    console.log("VaultPilot: handleAIEdit called");
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);

    if (!view) {
      new Notice("No active note found");
      return;
    }

    const editor = view.editor;
    const selection = editor.getSelection();

    if (!selection || selection.trim().length === 0) {
      new Notice("Please select some text first");
      return;
    }

    const file = view.file;
    if (!file) {
      new Notice("No file found");
      return;
    }

    // Save selection positions BEFORE opening modal
    const selectionStart = editor.getCursor("from");
    const selectionEnd = editor.getCursor("to");

    // Open the edit modal
    new EditModal(this.app, {
      selection,
      file,
      ollamaUrl: this.settings.ollamaUrl,
      provider: this.settings.provider,
      lmStudioUrl: this.settings.lmStudioUrl,
      openAIUrl: this.settings.openAIUrl,
      activeLLMProfileId: this.settings.activeLLMProfileId,
      presets: this.settings.quickActions,
      defaultModel: this.settings.defaultEditModel,
      onSubmit: async (instruction, model) => {
        await this.generateSuggestion(
          editor,
          file,
          selection,
          instruction,
          selectionStart,
          selectionEnd,
          model
        );
      },
    }).open();
  }

  async generateSuggestion(
    editor: Editor,
    file: TFile,
    selection: string,
    instruction: string,
    selectionStart: EditorPosition,
    selectionEnd: EditorPosition,
    model?: string
  ) {
    console.log("VaultPilot: generateSuggestion called");
    console.log("VaultPilot: Instruction:", instruction);

    try {
      // Assemble context with retrieval
      const assembler = new ContextAssembler(this.app, this.retrievalService, {
        inlineEditSystemPrompt: this.settings.inlineEditSystemPrompt,
      });
      const prompt = assembler.assembleContext(selection, file, instruction);

      console.log(
        "VaultPilot: Prompt assembled, calling provider...",
        this.settings.provider
      );

      // Stream response via selected provider
      const adapter = createAdapter({
        provider: this.settings.provider || "ollama",
        ollamaUrl: this.settings.ollamaUrl,
        lmStudioUrl: this.settings.lmStudioUrl,
        openAIUrl: this.settings.openAIUrl,
        openAIApiKey: this.settings.openAIApiKey,
        openAITemperature: this.settings.openAITemperature,
        defaultModel: this.settings.defaultEditModel,
      });
      const chunks: string[] = [];

      await adapter.stream(
        prompt,
        (chunk) => {
          chunks.push(chunk);
        },
        { model }
      );

      const suggestion = chunks.join("").trim();

      console.log(
        "VaultPilot: Received suggestion:",
        suggestion.slice(0, 100) + "..."
      );

      if (!suggestion || suggestion.length === 0) {
        new Notice("⚠️ No suggestion generated");
        return;
      }

      // Insert suggestion callout
      const callout = new SuggestionCallout(this.app);
      callout.insert(editor, {
        original: selection,
        suggestion,
        selectionStart,
        selectionEnd,
      });

      new Notice("✓ AI suggestion generated");
    } catch (err) {
      console.error("VaultPilot: AI Edit error:", err);

      // Check if it's a connection error
      if (
        err instanceof Error &&
        (err.message.includes("fetch") || err.message.includes("ECONNREFUSED"))
      ) {
        const provider = this.settings.provider || "ollama";
        if (provider === "lmstudio") {
          new Notice(
            "⚠️ Could not connect to LM Studio. Is Local Server enabled?"
          );
        } else if (provider === "openai") {
          new Notice(
            "⚠️ Could not connect to the OpenAI-compatible server. Check your base URL."
          );
        } else {
          new Notice("⚠️ Could not connect to Ollama. Is it running?");
        }
      } else {
        new Notice(
          "⚠️ Error generating suggestion: " +
            (err instanceof Error ? err.message : "Unknown error")
        );
      }
    }
  }

  testSuggestionCallout() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      new Notice("No active note found");
      return;
    }

    const editor = view.editor;
    const selection = editor.getSelection();

    if (!selection || selection.trim().length === 0) {
      new Notice("Please select some text first");
      return;
    }

    // Create a test suggestion (simple example: make text uppercase)
    const original = selection;
    const suggestion = selection.toUpperCase();

    // Get selection positions
    const selectionStart = editor.getCursor("from");
    const selectionEnd = editor.getCursor("to");

    // Insert suggestion callout
    const callout = new SuggestionCallout(this.app);
    callout.insert(editor, {
      original,
      suggestion,
      sources: ["Test Note A", "Test Note B"],
      selectionStart,
      selectionEnd,
    });

    new Notice("Test callout inserted! Check below your selection.");
  }
}

class SerendipitySettingTab extends PluginSettingTab {
  plugin: SerendipityPlugin;
  private selectedLLMProfileId: string | null = null;
  private draftLLMProfile: LLMProfile | null = null;
  private isLLMProfileDirty = false;
  private modelCacheByConnection = new Map<string, string[]>();

  constructor(app: App, plugin: SerendipityPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private resetDraftFromProfile(profileId?: string) {
    const profiles = this.plugin.settings.llmProfiles || [];
    const selected =
      profiles.find((profile) => profile.id === profileId) ||
      profiles.find(
        (profile) => profile.id === this.plugin.settings.activeLLMProfileId
      ) ||
      profiles[0] ||
      this.plugin.getActiveLLMProfile();
    this.selectedLLMProfileId = selected.id;
    this.draftLLMProfile = cloneLLMProfile(selected);
    this.isLLMProfileDirty = false;
  }

  private ensureDraftProfile() {
    if (!this.draftLLMProfile) {
      this.resetDraftFromProfile(
        this.selectedLLMProfileId || this.plugin.settings.activeLLMProfileId
      );
      return;
    }

    const stillExists = (this.plugin.settings.llmProfiles || []).some(
      (profile) => profile.id === this.draftLLMProfile?.id
    );
    if (!stillExists) {
      this.resetDraftFromProfile(this.plugin.settings.activeLLMProfileId);
    }
  }

  private getCurrentDraft() {
    this.ensureDraftProfile();
    return this.draftLLMProfile as LLMProfile;
  }

  private updateDraft(
    updater: (profile: LLMProfile) => void,
    rerender?: boolean
  ) {
    const draft = this.getCurrentDraft();
    updater(draft);
    this.isLLMProfileDirty = true;
    if (rerender) {
      this.display();
    }
  }

  private getModelsCacheKey(profile: LLMProfile) {
    const baseUrlRaw =
      profile.provider === "lmstudio"
        ? profile.lmStudioUrl || DEFAULT_SETTINGS.lmStudioUrl
        : profile.provider === "openai"
        ? profile.openAIUrl || DEFAULT_SETTINGS.openAIUrl
        : profile.ollamaUrl || DEFAULT_SETTINGS.ollamaUrl;
    const baseUrl = baseUrlRaw.replace(/\/$/, "");
    const authKey = profile.provider === "openai" ? profile.openAIApiKey : "";
    return `${profile.provider}|${baseUrl}|${authKey}`;
  }

  private appendStaticModelGroups(
    dropdown: any,
    existing: Set<string>,
    ordered: string[]
  ) {
    const selectEl: HTMLSelectElement | undefined = dropdown?.selectEl;
    if (!selectEl) return;

    for (const group of STATIC_MODEL_GROUPS) {
      const optgroup = document.createElement("optgroup");
      optgroup.label = group.label;
      let added = false;
      for (const model of group.models) {
        if (existing.has(model)) continue;
        existing.add(model);
        ordered.push(model);
        const option = document.createElement("option");
        option.value = model;
        option.text = model;
        optgroup.appendChild(option);
        added = true;
      }
      if (added) {
        selectEl.appendChild(optgroup);
      }
    }
  }

  private showModelsWarning(el: HTMLElement, provider: LLMProvider) {
    el.empty();
    if (provider === "lmstudio") {
      const note = el.createEl("div", {
        text: "Could not load models from LM Studio. ",
      });
      note.appendText("Enable the Local Server (OpenAI-compatible) in LM Studio: ");
      note.createEl("a", {
        text: "LM Studio",
        attr: { href: "https://lmstudio.ai" },
      });
      note.addClass("setting-item-description");
      return;
    }

    if (provider === "openai") {
      const note = el.createEl("div", {
        text: "Could not load models from your OpenAI-compatible server. ",
      });
      note.appendText(
        "Check the base URL and whether the endpoint requires an API key."
      );
      note.addClass("setting-item-description");
      return;
    }

    const note = el.createEl("div", {
      text: "Could not load models from Ollama. ",
    });
    note.appendText("Install or start Ollama: ");
    note.createEl("a", {
      text: "Download Ollama",
      attr: { href: "https://ollama.com/download" },
    });
    note.addClass("setting-item-description");
  }

  private clearWarning(el: HTMLElement) {
    el.empty();
  }

  private setReloadButtonsLoading(
    chatReloadBtn: any,
    editReloadBtn: any,
    loading: boolean
  ) {
    if (chatReloadBtn?.setDisabled) chatReloadBtn.setDisabled(loading);
    if (editReloadBtn?.setDisabled) editReloadBtn.setDisabled(loading);
    chatReloadBtn?.setTooltip?.(loading ? "Loading models…" : "Reload models");
    editReloadBtn?.setTooltip?.(loading ? "Loading models…" : "Reload models");
  }

  private setDropdownLoading(dropdown: any) {
    if (!dropdown?.selectEl) return;
    dropdown.selectEl.empty();
    dropdown.addOption("", "Loading models…");
    dropdown.setValue("");
    dropdown.selectEl.disabled = true;
  }

  private populateModelDropdown(
    dropdown: any,
    models: string[],
    preferred: string,
    helpEl: HTMLElement | null,
    provider: LLMProvider,
    showWarning: boolean
  ) {
    if (!dropdown?.selectEl) return;

    dropdown.selectEl.empty();
    const used = new Set<string>();
    const ordered: string[] = [];

    for (const model of models) {
      if (!model || used.has(model)) continue;
      dropdown.addOption(model, model);
      used.add(model);
      ordered.push(model);
    }

    this.appendStaticModelGroups(dropdown, used, ordered);

    if (ordered.length === 0) {
      dropdown.addOption("", "No models found");
      dropdown.setValue("");
      dropdown.selectEl.disabled = true;
    } else {
      dropdown.selectEl.disabled = false;
      const selection =
        preferred && ordered.includes(preferred) ? preferred : ordered[0];
      dropdown.setValue(selection);
    }

    if (helpEl) {
      if (showWarning) {
        this.showModelsWarning(helpEl, provider);
      } else {
        this.clearWarning(helpEl);
      }
    }
  }

  private getProviderDisplayName(provider: LLMProvider) {
    if (provider === "lmstudio") return "LM Studio";
    if (provider === "openai") return "OpenAI-compatible server";
    return "Ollama";
  }

  private async fetchRemoteModels(profile: LLMProfile) {
    const provider = profile.provider;
    let connected = false;
    let models: string[] = [];

    try {
      if (provider === "lmstudio" || provider === "openai") {
        const baseUrlRaw =
          provider === "lmstudio"
            ? profile.lmStudioUrl || DEFAULT_SETTINGS.lmStudioUrl
            : profile.openAIUrl || DEFAULT_SETTINGS.openAIUrl;
        const baseUrl = baseUrlRaw.replace(/\/$/, "");
        const modelsUrl =
          provider === "openai"
            ? baseUrl.endsWith("/v1/models")
              ? baseUrl
              : baseUrl.endsWith("/v1")
              ? `${baseUrl}/models`
              : `${baseUrl}/v1/models`
            : `${baseUrl}/v1/models`;
        const headers: Record<string, string> = {};
        if (provider === "openai" && profile.openAIApiKey) {
          headers.Authorization = `Bearer ${profile.openAIApiKey}`;
        }

        let text: string | null = null;
        try {
          const response = await requestUrl({
            url: modelsUrl,
            method: "GET",
            headers,
          });
          text =
            (response as any)?.text ??
            ((response as any)?.json
              ? JSON.stringify((response as any).json)
              : (response as any)?.data) ??
            null;
          connected = true;
        } catch (_err) {
          try {
            const resp = await fetch(modelsUrl, { headers });
            if (resp.ok) {
              text = await resp.text();
              connected = true;
            }
          } catch {}
        }

        if (text) {
          let data: any = null;
          try {
            data = JSON.parse(text);
          } catch {
            const start = text.indexOf("{");
            const end = text.lastIndexOf("}");
            if (start !== -1 && end !== -1 && end > start) {
              try {
                data = JSON.parse(text.slice(start, end + 1));
              } catch {}
            }
          }
          const arr: any[] = Array.isArray((data as any)?.data)
            ? (data as any).data
            : Array.isArray((data as any)?.models)
            ? (data as any).models
            : Array.isArray(data)
            ? (data as any)
            : [];
          models = arr
            .map((model: any) =>
              typeof model === "string"
                ? model
                : model?.id || model?.name || model?.model
            )
            .filter(Boolean);
        }
      } else {
        const baseUrl = (profile.ollamaUrl || DEFAULT_SETTINGS.ollamaUrl).replace(
          /\/$/,
          ""
        );
        const resp = await fetch(`${baseUrl}/api/tags`);
        if (resp.ok) {
          connected = true;
          const data = await resp.json();
          if (Array.isArray(data?.models)) {
            models = data.models
              .map((model: any) => model.model || model.name)
              .filter(Boolean);
          }
        }
      }
    } catch {}

    return {
      connected,
      models,
    };
  }

  private async fetchModelsForProfile(profile: LLMProfile, forceReload?: boolean) {
    const cacheKey = this.getModelsCacheKey(profile);
    if (!forceReload) {
      const cached = this.modelCacheByConnection.get(cacheKey);
      if (cached && cached.length > 0) {
        return { models: cached, showWarning: false };
      }
    }

    const provider = profile.provider;
    const fallbackModels =
      provider === "ollama" ? OLLAMA_FALLBACK_MODELS : STATIC_MODEL_LIST;
    const remote = await this.fetchRemoteModels(profile);
    let models = remote.models;
    const remoteOk = models.length > 0;

    if (!remoteOk && fallbackModels.length > 0) {
      console.warn(
        `Falling back to default model list for provider "${provider}".`
      );
      models = [...fallbackModels];
    }

    if (models.length > 0) {
      this.modelCacheByConnection.set(cacheKey, models);
    }

    return {
      models,
      showWarning: !remoteOk,
    };
  }

  private async testConnection(profile: LLMProfile) {
    const providerName = this.getProviderDisplayName(profile.provider);
    const remote = await this.fetchRemoteModels(profile);

    if (remote.connected && remote.models.length > 0) {
      new Notice(
        `✓ Connected to ${providerName}. Found ${remote.models.length} model${
          remote.models.length === 1 ? "" : "s"
        }.`
      );
      return;
    }

    if (remote.connected) {
      new Notice(`✓ Connected to ${providerName}, but no models were returned.`);
      return;
    }

    if (profile.provider === "lmstudio") {
      new Notice("⚠️ Could not connect to LM Studio. Is Local Server enabled?");
      return;
    }

    if (profile.provider === "openai") {
      new Notice(
        "⚠️ Could not connect to the OpenAI-compatible server. Check the base URL and API key."
      );
      return;
    }

    new Notice("⚠️ Could not connect to Ollama. Is it running?");
  }

  private async loadModelsAndPopulate(
    profile: LLMProfile,
    refs: {
      chatModelDropdown: any;
      editModelDropdown: any;
      chatHelpEl: HTMLElement | null;
      editHelpEl: HTMLElement | null;
      chatReloadBtn: any;
      editReloadBtn: any;
    },
    forceReload?: boolean
  ) {
    this.setReloadButtonsLoading(refs.chatReloadBtn, refs.editReloadBtn, true);
    this.setDropdownLoading(refs.chatModelDropdown);
    this.setDropdownLoading(refs.editModelDropdown);

    const { models, showWarning } = await this.fetchModelsForProfile(
      profile,
      forceReload
    );

    if (!this.draftLLMProfile || this.draftLLMProfile.id !== profile.id) {
      this.setReloadButtonsLoading(refs.chatReloadBtn, refs.editReloadBtn, false);
      return;
    }

    this.populateModelDropdown(
      refs.chatModelDropdown,
      models,
      this.draftLLMProfile.defaultChatModel,
      refs.chatHelpEl,
      profile.provider,
      showWarning
    );
    this.populateModelDropdown(
      refs.editModelDropdown,
      models,
      this.draftLLMProfile.defaultEditModel,
      refs.editHelpEl,
      profile.provider,
      showWarning
    );
    this.setReloadButtonsLoading(refs.chatReloadBtn, refs.editReloadBtn, false);
  }

  private async saveDraftProfile(refreshDisplay = true) {
    if (!this.draftLLMProfile) return;
    await this.plugin.saveLLMProfile(this.draftLLMProfile);
    this.resetDraftFromProfile(this.draftLLMProfile.id);
    if (refreshDisplay) {
      this.display();
    }
  }

  private async saveDraftProfileAsNew(refreshDisplay = true) {
    if (!this.draftLLMProfile) return null;
    const created = await this.plugin.saveLLMProfileAsNew(this.draftLLMProfile);
    this.resetDraftFromProfile(created.id);
    if (refreshDisplay) {
      this.display();
    }
    return created;
  }

  private revertDraft(refreshDisplay = true) {
    this.resetDraftFromProfile(this.selectedLLMProfileId || undefined);
    if (refreshDisplay) {
      this.display();
    }
  }

  private async resolveDirtyProfileChanges() {
    if (!this.isLLMProfileDirty) return true;
    const choice = await UnsavedChangesModal.prompt(
      this.app,
      "You have unsaved changes to this LLM profile. Save them before switching?"
    );
    if (choice === "cancel") return false;
    if (choice === "save") {
      await this.saveDraftProfile(false);
    } else {
      this.revertDraft(false);
    }
    return true;
  }

  private async handleProfileSelectionChange(nextId: string) {
    const currentId =
      this.selectedLLMProfileId || this.plugin.settings.activeLLMProfileId;
    if (!nextId || nextId === currentId) {
      this.display();
      return;
    }

    const canContinue = await this.resolveDirtyProfileChanges();
    if (!canContinue) {
      this.display();
      return;
    }

    await this.plugin.setActiveLLMProfile(nextId);
    this.resetDraftFromProfile(nextId);
    this.display();
  }

  private async handleDeleteSelectedProfile() {
    const profiles = this.plugin.settings.llmProfiles || [];
    if (profiles.length <= 1) {
      new Notice("At least one LLM profile must remain.");
      this.display();
      return;
    }

    const canContinue = await this.resolveDirtyProfileChanges();
    if (!canContinue) {
      this.display();
      return;
    }

    const profile = profiles.find(
      (item) => item.id === (this.selectedLLMProfileId || "")
    );
    if (!profile) {
      this.resetDraftFromProfile(this.plugin.settings.activeLLMProfileId);
      this.display();
      return;
    }

    const confirmed =
      typeof window === "undefined" || typeof window.confirm !== "function"
        ? true
        : window.confirm(`Delete the LLM profile "${profile.name}"?`);
    if (!confirmed) {
      this.display();
      return;
    }

    await this.plugin.deleteLLMProfile(profile.id);
    this.resetDraftFromProfile(this.plugin.settings.activeLLMProfileId);
    this.display();
  }

  private renderLLMProfileSection(container: HTMLElement) {
    const draft = this.getCurrentDraft();

    container.createEl("h3", { text: "LLM Profile" });

    new Setting(container)
      .setName("Active LLM Profile")
      .setDesc("Choose which saved LLM profile VaultPilot should use right now.")
      .addDropdown((drop: any) => {
        for (const profile of this.plugin.settings.llmProfiles || []) {
          drop.addOption(profile.id, profile.name);
        }
        drop.setValue(this.selectedLLMProfileId || draft.id);
        drop.onChange(async (value: string) => {
          await this.handleProfileSelectionChange(value);
        });
      });

    new Setting(container)
      .setName("Profile Name")
      .setDesc("This label is only used inside VaultPilot settings.")
      .addText((text) =>
        text
          .setPlaceholder("Profile name")
          .setValue(draft.name)
          .onChange((value) => {
            this.updateDraft((profile) => {
              profile.name = value;
            });
          })
      );

    new Setting(container)
      .setName("LLM Provider")
      .setDesc("Choose which LLM server this profile should use.")
      .addDropdown((drop: any) => {
        drop.addOption("ollama", "Ollama");
        drop.addOption("lmstudio", "LM Studio");
        drop.addOption("openai", "OpenAI-compatible");
        drop.setValue(draft.provider);
        drop.onChange((value: string) => {
          const nextProvider =
            value === "lmstudio" || value === "openai" ? value : "ollama";
          this.updateDraft(
            (profile) => {
              profile.provider = nextProvider;
            },
            true
          );
        });
      });

    let chatModelDropdown: any = null;
    let editModelDropdown: any = null;
    let chatHelpEl: HTMLElement | null = null;
    let editHelpEl: HTMLElement | null = null;
    let chatReloadBtn: any = null;
    let editReloadBtn: any = null;
    let ollamaUrlSetting: any = null;
    let lmStudioUrlSetting: any = null;
    let openAIUrlSetting: any = null;
    let openAIApiKeySetting: any = null;
    let openAITemperatureSetting: any = null;

    const clearModelWarnings = () => {
      if (chatHelpEl) this.clearWarning(chatHelpEl);
      if (editHelpEl) this.clearWarning(editHelpEl);
    };

    const updateProviderVisibility = () => {
      const currentProvider = this.getCurrentDraft().provider;
      const showOllama = currentProvider === "ollama";
      const showLMStudio = currentProvider === "lmstudio";
      const showOpenAI = currentProvider === "openai";

      if ((ollamaUrlSetting as any)?.settingEl) {
        (ollamaUrlSetting as any).settingEl.style.display = showOllama
          ? ""
          : "none";
      }
      if ((lmStudioUrlSetting as any)?.settingEl) {
        (lmStudioUrlSetting as any).settingEl.style.display = showLMStudio
          ? ""
          : "none";
      }
      if ((openAIUrlSetting as any)?.settingEl) {
        (openAIUrlSetting as any).settingEl.style.display = showOpenAI
          ? ""
          : "none";
      }
      if ((openAIApiKeySetting as any)?.settingEl) {
        (openAIApiKeySetting as any).settingEl.style.display = showOpenAI
          ? ""
          : "none";
      }
      if ((openAITemperatureSetting as any)?.settingEl) {
        (openAITemperatureSetting as any).settingEl.style.display = showOpenAI
          ? ""
          : "none";
      }
    };

    ollamaUrlSetting = new Setting(container)
      .setName("Ollama Base URL")
      .setDesc("The base URL for the Ollama API.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.ollamaUrl)
          .setValue(draft.ollamaUrl)
          .onChange((value) => {
            this.updateDraft((profile) => {
              profile.ollamaUrl = value;
            });
            clearModelWarnings();
          })
      );

    lmStudioUrlSetting = new Setting(container)
      .setName("LM Studio Base URL")
      .setDesc("Base URL for LM Studio Local Server (OpenAI-compatible).")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.lmStudioUrl)
          .setValue(draft.lmStudioUrl)
          .onChange((value) => {
            this.updateDraft((profile) => {
              profile.lmStudioUrl = value;
            });
            clearModelWarnings();
          })
      );

    openAIUrlSetting = new Setting(container)
      .setName("OpenAI-Compatible Base URL")
      .setDesc(
        "Base URL for OpenAI-compatible APIs (e.g., OpenAI, OpenRouter, Together, local proxies)."
      )
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.openAIUrl)
          .setValue(draft.openAIUrl)
          .onChange((value) => {
            this.updateDraft((profile) => {
              profile.openAIUrl = value;
            });
            clearModelWarnings();
          })
      );

    openAIApiKeySetting = new Setting(container)
      .setName("API Key (Optional)")
      .setDesc(
        "Optional API key for authentication. Only sent to the configured base URL above. Leave empty if your endpoint doesn't require authentication."
      )
      .addText((text) => {
        text
          .setPlaceholder("sk-...")
          .setValue(draft.openAIApiKey || "")
          .onChange((value) => {
            this.updateDraft((profile) => {
              profile.openAIApiKey = value;
            });
            clearModelWarnings();
          });
        (text.inputEl as HTMLInputElement).type = "password";
        return text;
      });

    openAITemperatureSetting = new Setting(container)
      .setName("Temperature (Optional)")
      .setDesc(
        "Temperature for requests (0-2). Leave blank to use model default. Required blank for GPT-5 and some other models that don't support custom temperature."
      )
      .addText((text) => {
        text
          .setPlaceholder("Leave blank for model default")
          .setValue(
            draft.openAITemperature !== undefined
              ? draft.openAITemperature.toString()
              : ""
          )
          .onChange((value) => {
            const trimmed = value.trim();
            if (trimmed === "") {
              this.updateDraft((profile) => {
                profile.openAITemperature = undefined;
              });
              return;
            }

            const num = parseFloat(trimmed);
            if (isNaN(num) || num < 0 || num > 2) {
              console.warn(
                `VaultPilot: Invalid temperature value "${trimmed}". Must be between 0 and 2.`
              );
              return;
            }

            this.updateDraft((profile) => {
              profile.openAITemperature = num;
            });
          });
        return text;
      });

    updateProviderVisibility();

    new Setting(container)
      .setName("Default Chat Model")
      .setDesc(
        "Model preselected in Discover chat (overrideable from the chat dropdown)."
      )
      .addDropdown((drop: any) => {
        chatModelDropdown = drop;
        drop.addOption("", "Loading models…");
        drop.setValue("");
        drop.onChange((value: string) => {
          this.updateDraft((profile) => {
            profile.defaultChatModel = value;
          });
        });
      })
      .addExtraButton((btn: any) => {
        chatReloadBtn = btn;
        btn.setIcon?.("refresh-ccw");
        btn.setTooltip?.("Reload models");
        btn.onClick?.(async () => {
          await this.loadModelsAndPopulate(this.getCurrentDraft(), {
            chatModelDropdown,
            editModelDropdown,
            chatHelpEl,
            editHelpEl,
            chatReloadBtn,
            editReloadBtn,
          }, true);
        });
      });
    chatHelpEl = container.createEl("div");

    new Setting(container)
      .setName("Default Edit Model")
      .setDesc(
        "Model preselected in the Edit with AI modal (overrideable from the dropdown)."
      )
      .addDropdown((drop: any) => {
        editModelDropdown = drop;
        drop.addOption("", "Loading models…");
        drop.setValue("");
        drop.onChange((value: string) => {
          this.updateDraft((profile) => {
            profile.defaultEditModel = value;
          });
        });
      })
      .addExtraButton((btn: any) => {
        editReloadBtn = btn;
        btn.setIcon?.("refresh-ccw");
        btn.setTooltip?.("Reload models");
        btn.onClick?.(async () => {
          await this.loadModelsAndPopulate(this.getCurrentDraft(), {
            chatModelDropdown,
            editModelDropdown,
            chatHelpEl,
            editHelpEl,
            chatReloadBtn,
            editReloadBtn,
          }, true);
        });
      });
    editHelpEl = container.createEl("div");

    const actions = container.createDiv({ cls: "vp-llm-profile-actions" });

    const testConnectionButton = actions.createEl("button", {
      text: "Test Connection",
    });
    testConnectionButton.addEventListener("click", async () => {
      testConnectionButton.disabled = true;
      try {
        await this.testConnection(this.getCurrentDraft());
      } finally {
        testConnectionButton.disabled = false;
      }
    });

    const saveButton = actions.createEl("button", { text: "Save Profile" });
    saveButton.addClass("mod-cta");
    saveButton.addEventListener("click", async () => {
      await this.saveDraftProfile(true);
    });

    const saveAsNewButton = actions.createEl("button", { text: "Save As New" });
    saveAsNewButton.addEventListener("click", async () => {
      await this.saveDraftProfileAsNew(true);
    });

    const revertButton = actions.createEl("button", { text: "Revert" });
    revertButton.addEventListener("click", () => {
      this.revertDraft(true);
    });

    const deleteButton = actions.createEl("button", { text: "Delete" });
    deleteButton.disabled = (this.plugin.settings.llmProfiles || []).length <= 1;
    deleteButton.addEventListener("click", async () => {
      await this.handleDeleteSelectedProfile();
    });

    void this.loadModelsAndPopulate(draft, {
      chatModelDropdown,
      editModelDropdown,
      chatHelpEl,
      editHelpEl,
      chatReloadBtn,
      editReloadBtn,
    });
  }

  private renderChatTab(container: HTMLElement) {
    this.renderLLMProfileSection(container);

    container.createEl("h3", { text: "Default Language" });

    new Setting(container)
      .setName("Default Language")
      .setDesc(
        "Language used in {{default_language}} template variable. The assistant will attempt to reply in this language when appropriate."
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("English", "English")
          .addOption("Spanish", "Spanish")
          .addOption("French", "French")
          .addOption("German", "German")
          .addOption("Italian", "Italian")
          .addOption("Portuguese", "Portuguese")
          .addOption("Chinese", "Chinese (中文)")
          .addOption("Japanese", "Japanese (日本語)")
          .addOption("Korean", "Korean (한국어)")
          .addOption("Russian", "Russian (Русский)")
          .addOption("Arabic", "Arabic (العربية)")
          .setValue(this.plugin.settings.defaultLanguage)
          .onChange(async (value) => {
            this.plugin.settings.defaultLanguage = value;
            await this.plugin.saveSettings();
          })
      );

    container.createEl("h3", { text: "System Prompt" });

    new Setting(container)
      .setName("Chat System Prompt")
      .setDesc(
        "Instructions prepended to chat conversations. Supports template variables: {{current_date_iso}}, {{vault_name}}, {{default_language}}. These will be replaced with actual values when the chat starts."
      );

    const chatSystemPromptTextarea = container.createEl("textarea", {
      attr: {
        rows: "6",
        placeholder:
          "You are a helpful assistant for Obsidian. Help the user understand and work with their notes.",
        style:
          "width: 100%; margin-bottom: 18px; padding: 8px; font-family: var(--font-monospace); font-size: 0.9em;",
      },
    });
    chatSystemPromptTextarea.value = this.plugin.settings.chatSystemPrompt || "";
    chatSystemPromptTextarea.addEventListener("change", async () => {
      this.plugin.settings.chatSystemPrompt = chatSystemPromptTextarea.value;
      await this.plugin.saveSettings();
    });

    container.createEl("div", {
      cls: "setting-item-description",
      text: "💡 Template variables like {{vault_name}} will be automatically replaced with real values. You can add, edit, or remove these variables as needed.",
    });

    container.createEl("h3", { text: "Token Window" });

    new Setting(container)
      .setName("Max Prompt Tokens")
      .setDesc(
        "Maximum number of tokens allowed in the chat prompt (hard cap for input tokens)."
      )
      .addText((text) =>
        text
          .setPlaceholder("16384")
          .setValue(String(this.plugin.settings.maxPromptTokens))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num >= 1) {
              this.plugin.settings.maxPromptTokens = num;
              if (this.plugin.settings.reservedResponseTokens >= num) {
                this.plugin.settings.reservedResponseTokens = Math.max(1, num - 1);
              }
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(container)
      .setName("Reserved Response Tokens")
      .setDesc(
        "Number of tokens reserved for the model's response (must be less than max prompt tokens)."
      )
      .addText((text) =>
        text
          .setPlaceholder("2048")
          .setValue(String(this.plugin.settings.reservedResponseTokens))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (
              !isNaN(num) &&
              num >= 1 &&
              num < this.plugin.settings.maxPromptTokens
            ) {
              this.plugin.settings.reservedResponseTokens = num;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(container)
      .setName("Recent Messages to Keep")
      .setDesc(
        "Target number of recent messages to keep verbatim in chat history."
      )
      .addText((text) =>
        text
          .setPlaceholder("6")
          .setValue(String(this.plugin.settings.recentMessagesToKeep))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num >= 1) {
              this.plugin.settings.recentMessagesToKeep = num;
              if (this.plugin.settings.minRecentMessagesToKeep > num) {
                this.plugin.settings.minRecentMessagesToKeep = num;
              }
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(container)
      .setName("Min Recent Messages to Keep")
      .setDesc(
        "Minimum number of recent messages to preserve before compressing (must be ≤ recent messages to keep)."
      )
      .addText((text) =>
        text
          .setPlaceholder("2")
          .setValue(String(this.plugin.settings.minRecentMessagesToKeep))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (
              !isNaN(num) &&
              num >= 1 &&
              num <= this.plugin.settings.recentMessagesToKeep
            ) {
              this.plugin.settings.minRecentMessagesToKeep = num;
              await this.plugin.saveSettings();
            }
          })
      );
  }

  private renderEditTab(container: HTMLElement) {
    new Setting(container)
      .setName("System Prompt")
      .setDesc(
        "Prepended to every Edit with AI request. Keep concise; you can override style in the instruction."
      );

    const editSystemPromptTextarea = container.createEl("textarea", {
      attr: {
        rows: "6",
        placeholder:
          "You are an AI writing assistant for Obsidian. Your task is to help the user edit their note.",
        style:
          "width: 100%; margin-bottom: 18px; padding: 8px; font-family: var(--font-monospace); font-size: 0.9em;",
      },
    });
    editSystemPromptTextarea.value =
      this.plugin.settings.inlineEditSystemPrompt || "";
    editSystemPromptTextarea.addEventListener("change", async () => {
      this.plugin.settings.inlineEditSystemPrompt =
        editSystemPromptTextarea.value;
      await this.plugin.saveSettings();
    });

    container.createEl("div", {
      cls: "setting-item-description",
      text: "Default Edit Model is managed in the Chat tab under LLM Profile.",
    });

    container.createEl("h3", { text: "Quick Action Presets" });

    new Setting(container)
      .setName("Rewrite Prompt")
      .setDesc("Default instruction used when clicking Rewrite.")
      .addText((text) =>
        text
          .setPlaceholder("Rewrite this text to be clearer and more engaging.")
          .setValue(this.plugin.settings.quickActions.rewrite)
          .onChange(async (value) => {
            this.plugin.settings.quickActions.rewrite = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(container)
      .setName("Tighten Prompt")
      .setDesc("Default instruction used when clicking Tighten.")
      .addText((text) =>
        text
          .setPlaceholder(
            "Make this text more concise while preserving key information."
          )
          .setValue(this.plugin.settings.quickActions.tighten)
          .onChange(async (value) => {
            this.plugin.settings.quickActions.tighten = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(container)
      .setName("Expand Prompt")
      .setDesc("Default instruction used when clicking Expand.")
      .addText((text) =>
        text
          .setPlaceholder("Expand this text with more detail and examples.")
          .setValue(this.plugin.settings.quickActions.expand)
          .onChange(async (value) => {
            this.plugin.settings.quickActions.expand = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(container)
      .setName("Grammar Prompt")
      .setDesc("Default instruction used when clicking Grammar.")
      .addText((text) =>
        text
          .setPlaceholder("Fix grammar, spelling, and punctuation errors.")
          .setValue(this.plugin.settings.quickActions.grammar)
          .onChange(async (value) => {
            this.plugin.settings.quickActions.grammar = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(container)
      .setName("Translate Prompt")
      .setDesc("Default instruction used when clicking Translate.")
      .addText((text) =>
        text
          .setPlaceholder("Translate this text to Spanish.")
          .setValue(this.plugin.settings.quickActions.translate)
          .onChange(async (value) => {
            this.plugin.settings.quickActions.translate = value;
            await this.plugin.saveSettings();
          })
      );
  }

  private renderTagsTab(container: HTMLElement) {
    new Setting(container)
      .setName("Use LLM for tag suggestions")
      .setDesc(
        "Enable LLM-backed tag suggestions; falls back to local keywords when unavailable."
      )
      .addToggle((toggle: any) => {
        toggle.setValue(this.plugin.settings.tagSuggestions?.useLLM !== false);
        toggle.onChange(async (value: boolean) => {
          this.plugin.settings.tagSuggestions = this.plugin.settings
            .tagSuggestions || {
            useLLM: true,
            min: 3,
            max: 5,
            confirmBeforeInsert: true,
            modelOverride: "",
          };
          this.plugin.settings.tagSuggestions.useLLM = !!value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(container)
      .setName("Min suggestions")
      .setDesc("Minimum number of tags to propose (default 3).")
      .addText((text) =>
        text
          .setPlaceholder("3")
          .setValue(String(this.plugin.settings.tagSuggestions?.min ?? 3))
          .onChange(async (value) => {
            const n = Math.max(1, parseInt(value || "3", 10) || 3);
            this.plugin.settings.tagSuggestions = this.plugin.settings
              .tagSuggestions || {
              useLLM: true,
              min: 3,
              max: 5,
              confirmBeforeInsert: true,
              modelOverride: "",
            };
            this.plugin.settings.tagSuggestions.min = n;
            if ((this.plugin.settings.tagSuggestions.max ?? 5) < n) {
              this.plugin.settings.tagSuggestions.max = n;
            }
            await this.plugin.saveSettings();
          })
      );

    new Setting(container)
      .setName("Max suggestions")
      .setDesc("Maximum number of tags to propose (default 5).")
      .addText((text) =>
        text
          .setPlaceholder("5")
          .setValue(String(this.plugin.settings.tagSuggestions?.max ?? 5))
          .onChange(async (value) => {
            const curMin = this.plugin.settings.tagSuggestions?.min ?? 3;
            let n = parseInt(value || "5", 10);
            if (isNaN(n) || n < curMin) n = curMin;
            this.plugin.settings.tagSuggestions = this.plugin.settings
              .tagSuggestions || {
              useLLM: true,
              min: 3,
              max: 5,
              confirmBeforeInsert: true,
              modelOverride: "",
            };
            this.plugin.settings.tagSuggestions.max = n;
            await this.plugin.saveSettings();
          })
      );

    new Setting(container)
      .setName("Confirm before inserting")
      .setDesc("Show a modal to confirm tags before writing to the note.")
      .addToggle((toggle: any) => {
        toggle.setValue(
          this.plugin.settings.tagSuggestions?.confirmBeforeInsert !== false
        );
        toggle.onChange(async (value: boolean) => {
          this.plugin.settings.tagSuggestions = this.plugin.settings
            .tagSuggestions || {
            useLLM: true,
            min: 3,
            max: 5,
            confirmBeforeInsert: true,
            modelOverride: "",
          };
          this.plugin.settings.tagSuggestions.confirmBeforeInsert = !!value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(container)
      .setName("Model override (optional)")
      .setDesc(
        "Model to use for tag suggestions. Leave empty to use the Default Chat Model."
      )
      .addText((text) =>
        text
          .setPlaceholder("Leave empty for default")
          .setValue(this.plugin.settings.tagSuggestions?.modelOverride ?? "")
          .onChange(async (value) => {
            this.plugin.settings.tagSuggestions = this.plugin.settings
              .tagSuggestions || {
              useLLM: true,
              min: 3,
              max: 5,
              confirmBeforeInsert: true,
              modelOverride: "",
            };
            this.plugin.settings.tagSuggestions.modelOverride = value || "";
            await this.plugin.saveSettings();
          })
      );
  }

  display(): void {
    const { containerEl } = this;

    this.ensureDraftProfile();

    containerEl.empty();
    containerEl.createEl("h2", { text: "VaultPilot Settings" });

    const tabs: Tabs = {
      chat: {
        title: "Chat",
        icon: "message-circle",
        content_generator: (container) => this.renderChatTab(container),
      },
      edit: {
        title: "Edit with AI",
        icon: "edit",
        content_generator: (container) => this.renderEditTab(container),
      },
      tags: {
        title: "Tag Suggestions",
        icon: "tag",
        content_generator: (container) => this.renderTagsTab(container),
      },
    };

    createTabs(containerEl, tabs);
  }
}
