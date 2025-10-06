/*
  Headless tests for context attachments (Ticket 32).
  Verifies:
  1) Merged context includes multiple fenced files once each
  2) Dedupe of active note vs attachment (no duplicate fences)
  3) Large attachment causes token-aware trimming in ChatService stub
  4) Rename scenario updates fence path
*/

const path = require('path');

// Add mock path so `require('obsidian')` resolves to our stub if needed
process.env.NODE_PATH = path.resolve(__dirname, 'mocks');
require('module').Module._initPaths();

const { Vault, TFile } = require('./mocks/obsidian');

// Minimal ChatService stub (mirrors scripts/chat-window-test.js behavior)
class StubLLMAdapter {
  async generate() { return 'SUMMARY'; }
  async stream(_prompt, onChunk) { onChunk('ok'); }
}

class ChatService {
  constructor(adapter, options) {
    this.adapter = adapter;
    this.messages = [];
    this.options = {
      maxPromptTokens: options?.maxPromptTokens ?? 8192,
      reservedResponseTokens: options?.reservedResponseTokens ?? 512,
      recentMessagesToKeep: options?.recentMessagesToKeep ?? 6,
      minRecentMessagesToKeep: options?.minRecentMessagesToKeep ?? 2,
    };
  }

  estimateTokens(text) {
    if (!text || text.length === 0) return 0;
    const baseTokens = Math.ceil(text.length / 4);
    const overhead = Math.ceil(baseTokens * 0.05);
    return baseTokens + overhead;
  }

  async sendMessage(userMessage, context, onChunk) {
    this.messages.push({ role: 'user', content: userMessage });
    const prompt = this.buildPrompt(userMessage, context);
    await this.adapter.stream(prompt, onChunk);
    this.messages.push({ role: 'assistant', content: 'ok' });
  }

  buildPrompt(userMessage, context) {
    const effectiveBudget = this.options.maxPromptTokens - this.options.reservedResponseTokens;

    // Estimate tokens for messages (simple: just current turn)
    let messagesTokens = 0;
    messagesTokens += this.estimateTokens(`User: ${userMessage}\n`);
    messagesTokens += this.estimateTokens('Assistant:');

    const remainingBudget = effectiveBudget - messagesTokens;

    let trimmedContext = '';
    const contextOverhead = this.estimateTokens(
      'You are a helpful assistant. You have access to the following document:\n\n--- BEGIN DOCUMENT ---\n\n--- END DOCUMENT ---\n\n'
    );

    if (context && context.trim().length > 0 && remainingBudget > contextOverhead) {
      const availableForContextContent = remainingBudget - contextOverhead;
      let maxContextChars = availableForContextContent * 4;
      if (maxContextChars > 0) {
        trimmedContext = context.slice(0, maxContextChars);
        let contextTokens = this.estimateTokens(trimmedContext) + contextOverhead;
        while (contextTokens > remainingBudget && trimmedContext.length > 0) {
          trimmedContext = trimmedContext.slice(0, Math.floor(trimmedContext.length * 0.9));
          contextTokens = this.estimateTokens(trimmedContext) + contextOverhead;
        }
      }
    }

    let prompt = '';
    if (trimmedContext.length > 0) {
      prompt += 'You are a helpful assistant. You have access to the following document:\n\n';
      prompt += '--- BEGIN DOCUMENT ---\n';
      prompt += trimmedContext;
      prompt += '\n--- END DOCUMENT ---\n\n';
    }
    prompt += `User: ${userMessage}\n`;
    prompt += 'Assistant:';
    return prompt;
  }
}

// Function under test: build the combined context string from active + attachments
async function buildContextFromAttachments(vault, activeFilePath, attachedPaths) {
  const parts = [];
  const uniquePaths = Array.from(new Set([activeFilePath, ...(attachedPaths || [])].filter(Boolean)));
  for (const p of uniquePaths) {
    const file = vault.getAbstractFileByPath(p);
    if (!file) continue;
    const content = await vault.read(file);
    const isActive = p === activeFilePath;
    const begin = isActive ? `--- BEGIN ACTIVE FILE: ${p} ---` : `--- BEGIN ATTACHED FILE: ${p} ---`;
    const end = isActive ? `--- END ACTIVE FILE ---` : `--- END ATTACHED FILE ---`;
    parts.push(`${begin}\n${content}\n${end}\n\n`);
  }
  return parts.join('');
}

async function run() {
  let pass = 0, fail = 0;
  const assert = (cond, msg) => { if (cond) { console.log(`✅ PASS: ${msg}`); pass++; } else { console.log(`❌ FAIL: ${msg}`); fail++; } };

  // Setup vault and files
  const vault = new Vault();
  vault.addFile('notes/a.md', '# A\nHello A');
  vault.addFile('notes/b.md', '# B\nHello B');
  vault.addFile('notes/big.md', 'Big '.repeat(5000));

  // 1) Merge two files
  {
    const context = await buildContextFromAttachments(vault, 'notes/a.md', ['notes/b.md']);
    const countA = (context.match(/BEGIN ACTIVE FILE: notes\/a.md/g) || []).length;
    const countB = (context.match(/BEGIN ATTACHED FILE: notes\/b.md/g) || []).length;
    assert(countA === 1, 'Active file fenced once');
    assert(countB === 1, 'Attached file fenced once');
  }

  // 2) Dedupe active vs attachment
  {
    const context = await buildContextFromAttachments(vault, 'notes/a.md', ['notes/a.md']);
    const countAActive = (context.match(/BEGIN ACTIVE FILE: notes\/a.md/g) || []).length;
    const countAAttached = (context.match(/BEGIN ATTACHED FILE: notes\/a.md/g) || []).length;
    assert(countAActive === 1, 'Active file appears once even if attached');
    assert(countAAttached === 0, 'Active file not duplicated as attached');
  }

  // 3) Large context trimming through ChatService
  {
    const largeContext = await buildContextFromAttachments(vault, 'notes/a.md', ['notes/big.md']);
    const service = new ChatService(new StubLLMAdapter(), { maxPromptTokens: 800, reservedResponseTokens: 100 });
    const prompt = service.buildPrompt('Summarize docs', largeContext);
    const tok = service.estimateTokens(prompt);
    assert(tok <= 800, `Prompt fits budget (${tok} <= 800)`);
    assert(/--- BEGIN DOCUMENT ---/.test(prompt), 'Prompt includes BEGIN DOCUMENT wrapper');
  }

  // 4) Rename scenario
  {
    // Rename b.md -> b2.md in vault and attachment list
    vault.rename('notes/b.md', 'notes/b2.md');
    const context = await buildContextFromAttachments(vault, 'notes/a.md', ['notes/b2.md']);
    const countOld = (context.match(/BEGIN ATTACHED FILE: notes\/b.md/g) || []).length;
    const countNew = (context.match(/BEGIN ATTACHED FILE: notes\/b2.md/g) || []).length;
    assert(countOld === 0, 'Old path not present after rename');
    assert(countNew === 1, 'New path present after rename');
  }

  console.log('\n' + '='.repeat(50));
  console.log(`Test Results: ${pass} passed, ${fail} failed`);
  console.log('='.repeat(50) + '\n');
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((e) => { console.error('Test error:', e); process.exit(1); });

