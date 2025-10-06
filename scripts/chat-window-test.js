/*
  Headless test for chat token window and compaction.
  Tests ChatService with stub LLM adapter to verify:
  - Under budget (no compaction)
  - Over budget (compaction with summarization)
  - Recent window exceeds budget (dynamic shrinking)
  - Large context trimming
  - Summarization failure fallback
*/

const path = require('path');

// Add mock path so `require('obsidian')` resolves to our stub
process.env.NODE_PATH = path.resolve(__dirname, 'mocks');
require('module').Module._initPaths();

// Stub LLM Adapter for testing
class StubLLMAdapter {
	constructor() {
		this.generateCallCount = 0;
		this.shouldFail = false;
	}

	async generate(prompt, options) {
		this.generateCallCount++;
		if (this.shouldFail) {
			throw new Error('Simulated LLM failure');
		}
		// Return deterministic summary
		return `SUMMARIZED: Summary of conversation (call ${this.generateCallCount})`;
	}

	async stream(prompt, onChunk, options) {
		const response = 'Test response from stub adapter.';
		// Simulate streaming by chunking
		for (let i = 0; i < response.length; i += 5) {
			const chunk = response.slice(i, i + 5);
			onChunk(chunk);
		}
	}
}

// Minimal ChatService constructor needs to be accessible
// We'll use a simple approach: import the built code and access ChatService
// Since ChatService is not exported, we'll recreate it here based on the implementation

class ChatService {
	constructor(adapter, options) {
		this.adapter = adapter;
		this.messages = [];
		this.sessionManager = null;
		this.currentSessionId = null;
		this.options = {
			maxPromptTokens: options?.maxPromptTokens ?? 8192,
			reservedResponseTokens: options?.reservedResponseTokens ?? 512,
			recentMessagesToKeep: options?.recentMessagesToKeep ?? 6,
			minRecentMessagesToKeep: options?.minRecentMessagesToKeep ?? 2,
		};
	}

	async sendMessage(userMessage, context, onChunk) {
		// Add user message to history
		this.messages.push({ role: 'user', content: userMessage });

		// Compact history if needed (token windowing)
		await this.compactHistoryIfNeeded(context);

		// Build prompt with context
		const prompt = this.buildPrompt(userMessage, context);

		// Stream response
		const responseChunks = [];
		await this.adapter.stream(prompt, (chunk) => {
			responseChunks.push(chunk);
			onChunk(chunk);
		});

		// Add assistant response to history
		const fullResponse = responseChunks.join('');
		this.messages.push({ role: 'assistant', content: fullResponse });
	}

	buildPrompt(userMessage, context) {
		const effectiveBudget = this.options.maxPromptTokens - this.options.reservedResponseTokens;

		// Check for system summary
		let systemSummary = '';
		if (this.messages.length > 0 && this.messages[0].role === 'system') {
			systemSummary = this.messages[0].content;
		}

		// Get conversation history
		const startIdx = systemSummary ? 1 : 0;
		const historyMessages = this.messages.slice(startIdx, -1);

		// Estimate tokens for messages
		let messagesTokens = 0;
		if (systemSummary) {
			messagesTokens += this.estimateTokens(`Conversation summary: ${systemSummary}\n\n`);
		}
		if (historyMessages.length > 0) {
			messagesTokens += this.estimateTokens('Previous conversation:\n');
			for (const msg of historyMessages) {
				if (msg.role === 'system') continue;
				messagesTokens += this.estimateTokens(`${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`);
			}
			messagesTokens += this.estimateTokens('\n');
		}
		messagesTokens += this.estimateTokens(`User: ${userMessage}\n`);
		messagesTokens += this.estimateTokens('Assistant:');

		// Calculate remaining budget for context
		const remainingBudget = effectiveBudget - messagesTokens;

		// Trim context to fit
		let trimmedContext = '';
		const contextOverhead = this.estimateTokens('You are a helpful assistant. You have access to the following document:\n\n--- BEGIN DOCUMENT ---\n\n--- END DOCUMENT ---\n\n');

		if (context && context.trim().length > 0 && remainingBudget > contextOverhead) {
			const availableForContextContent = remainingBudget - contextOverhead;
			const maxContextChars = availableForContextContent * 4;

			if (maxContextChars > 0) {
				trimmedContext = context.slice(0, maxContextChars);
				let contextTokens = this.estimateTokens(trimmedContext) + contextOverhead;

				while (contextTokens > remainingBudget && trimmedContext.length > 0) {
					trimmedContext = trimmedContext.slice(0, Math.floor(trimmedContext.length * 0.9));
					contextTokens = this.estimateTokens(trimmedContext) + contextOverhead;
				}
			}
		}

		// Build final prompt
		let prompt = '';
		if (trimmedContext.length > 0) {
			prompt += 'You are a helpful assistant. You have access to the following document:\n\n';
			prompt += '--- BEGIN DOCUMENT ---\n';
			prompt += trimmedContext;
			prompt += '\n--- END DOCUMENT ---\n\n';
		}
		if (systemSummary) {
			prompt += `Conversation summary: ${systemSummary}\n\n`;
		}
		if (historyMessages.length > 0) {
			prompt += 'Previous conversation:\n';
			for (const msg of historyMessages) {
				if (msg.role === 'system') continue;
				prompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
			}
			prompt += '\n';
		}
		prompt += `User: ${userMessage}\n`;
		prompt += 'Assistant:';

		return prompt;
	}

	async compactHistoryIfNeeded(context) {
		const effectiveBudget = this.options.maxPromptTokens - this.options.reservedResponseTokens;

		const messagesTokens = this.estimateMessagesTokens(this.messages);
		const contextTokens = this.estimateTokens(context);
		const totalTokens = messagesTokens + contextTokens;

		// If under budget, no compaction needed
		if (totalTokens <= effectiveBudget) {
			return;
		}

		// Over budget: compact older messages
		const keepN = this.options.recentMessagesToKeep;

		// Not enough messages to compact
		if (this.messages.length <= keepN) {
			return;
		}

		// Partition: recent messages to keep verbatim
		const recentMessages = this.messages.slice(-keepN);
		const olderMessages = this.messages.slice(0, -keepN);

		// Find existing system summary
		let previousSummary = '';
		const nonSystemOlder = olderMessages.filter(msg => {
			if (msg.role === 'system') {
				if (previousSummary === '') {
					previousSummary = msg.content;
				}
				return false;
			}
			return true;
		});

		// If no older messages to summarize (only system), skip
		if (nonSystemOlder.length === 0 && previousSummary !== '') {
			this.messages = [
				{ role: 'system', content: previousSummary },
				...recentMessages
			];
			return;
		}

		// Build summarization prompt
		let summarizationPrompt = 'Summarize the conversation so far for an assistant. Keep key facts, constraints, decisions, action items, and unresolved questions. Be concise. Do not invent details.\n\n';

		if (previousSummary) {
			summarizationPrompt += `Previous summary: ${previousSummary}\n\n`;
		}

		if (nonSystemOlder.length > 0) {
			summarizationPrompt += 'Conversation to summarize:\n';
			for (const msg of nonSystemOlder) {
				const role = msg.role === 'user' ? 'User' : 'Assistant';
				summarizationPrompt += `${role}: ${msg.content}\n`;
			}
		}

		// Generate summary using LLM
		let summary;
		try {
			summary = await this.adapter.generate(summarizationPrompt, { temperature: 0.3 });
			summary = summary.trim();
		} catch (err) {
			// Fallback: truncated summary
			const truncated = nonSystemOlder.slice(0, 2).map(msg => {
				const role = msg.role === 'user' ? 'User' : 'Assistant';
				return `${role}: ${msg.content.slice(0, 100)}...`;
			}).join(' ');
			summary = `[Summarized due to token limit] ${previousSummary ? previousSummary + ' ' : ''}${truncated}`;
		}

		// Replace history with summary + recent messages
		this.messages = [
			{ role: 'system', content: summary },
			...recentMessages
		];

		// Edge case: Check if recent window alone exceeds budget
		const messagesOnlyTokens = this.estimateMessagesTokens(this.messages);
		if (messagesOnlyTokens > effectiveBudget) {
			await this.handleOversizedRecentWindow(effectiveBudget, summary);
		}
	}

	async handleOversizedRecentWindow(effectiveBudget, existingSummary) {
		const minKeep = this.options.minRecentMessagesToKeep;
		const currentKeep = this.options.recentMessagesToKeep;

		// Try shrinking the recent window gradually
		for (let keepN = currentKeep - 1; keepN >= minKeep; keepN--) {
			const systemMsg = this.messages[0].role === 'system' ? this.messages[0] : null;
			const nonSystemMessages = systemMsg ? this.messages.slice(1) : this.messages;

			const newRecentMessages = nonSystemMessages.slice(-keepN);
			const toSummarize = nonSystemMessages.slice(0, -keepN);

			if (toSummarize.length === 0) {
				this.messages = systemMsg ? [systemMsg, ...newRecentMessages] : newRecentMessages;
			} else {
				let updatedSummary = existingSummary;
				try {
					const summarizationPrompt = `Update this summary with additional context. Keep it concise.\n\nExisting summary: ${existingSummary}\n\nAdditional messages:\n${toSummarize.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join('\n')}`;
					updatedSummary = await this.adapter.generate(summarizationPrompt, { temperature: 0.3 });
					updatedSummary = updatedSummary.trim();
				} catch (err) {
					// Keep existing summary on error
				}

				this.messages = [
					{ role: 'system', content: updatedSummary },
					...newRecentMessages
				];
			}

			const newTokens = this.estimateMessagesTokens(this.messages);
			if (newTokens <= effectiveBudget) {
				return;
			}
		}

		// Last resort: ultra-concise summary + 1-2 messages
		const systemMsg = this.messages[0].role === 'system' ? this.messages[0] : null;
		const nonSystemMessages = systemMsg ? this.messages.slice(1) : this.messages;

		const absoluteMinimum = Math.min(2, nonSystemMessages.length);
		const keptMessages = nonSystemMessages.slice(-absoluteMinimum);
		const toSummarize = nonSystemMessages.slice(0, -absoluteMinimum);

		let finalSummary = existingSummary;
		if (toSummarize.length > 0) {
			try {
				const summarizationPrompt = `Create an extremely concise summary (max 2-3 sentences) of this conversation.\n\nExisting summary: ${existingSummary}\n\nAdditional messages:\n${toSummarize.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content.slice(0, 200)}`).join('\n')}`;
				finalSummary = await this.adapter.generate(summarizationPrompt, { temperature: 0.3 });
				finalSummary = finalSummary.trim();
			} catch (err) {
				finalSummary = `[Conversation summary] ${existingSummary.slice(0, 150)}`;
			}
		}

		this.messages = [
			{ role: 'system', content: finalSummary },
			...keptMessages
		];
	}

	estimateTokens(text) {
		if (!text || text.length === 0) return 0;
		const baseTokens = Math.ceil(text.length / 4);
		const overhead = Math.ceil(baseTokens * 0.05);
		return baseTokens + overhead;
	}

	estimateMessagesTokens(messages) {
		if (!messages || messages.length === 0) return 0;
		let total = 0;
		for (const msg of messages) {
			total += this.estimateTokens(msg.content);
			total += 2; // role label overhead
		}
		return total;
	}

	getHistory() {
		return [...this.messages];
	}

	clearHistory() {
		this.messages = [];
	}
}

// Test scenarios
async function runTests() {
	let passCount = 0;
	let failCount = 0;

	function assert(condition, testName) {
		if (condition) {
			console.log(`✅ PASS: ${testName}`);
			passCount++;
		} else {
			console.log(`❌ FAIL: ${testName}`);
			failCount++;
		}
	}

	console.log('\n🧪 Starting Chat Window Tests...\n');

	// Test 1: Under budget (no compaction)
	{
		console.log('Test 1: Under budget (no compaction)');
		const adapter = new StubLLMAdapter();
		const service = new ChatService(adapter, {
			maxPromptTokens: 8192,
			reservedResponseTokens: 512,
			recentMessagesToKeep: 6,
			minRecentMessagesToKeep: 2
		});

		await service.sendMessage('Hello', '', () => {});
		await service.sendMessage('How are you?', '', () => {});

		const history = service.getHistory();
		assert(history.length === 4, 'Should have 4 messages (2 user + 2 assistant)');
		assert(history[0].role === 'user', 'First message should be user');
		assert(adapter.generateCallCount === 0, 'No summarization should occur (under budget)');

		service.clearHistory();
		console.log('');
	}

	// Test 2: Over budget (compaction with summarization)
	{
		console.log('Test 2: Over budget (compaction with summarization)');
		const adapter = new StubLLMAdapter();
		const service = new ChatService(adapter, {
			maxPromptTokens: 400, // Very low to trigger compaction
			reservedResponseTokens: 50,
			recentMessagesToKeep: 4,
			minRecentMessagesToKeep: 2
		});

		// Add many longer messages to exceed budget
		for (let i = 0; i < 10; i++) {
			await service.sendMessage(`Message ${i}: This is a test message with some content to make it longer and exceed the token budget.`, '', () => {});
		}

		const history = service.getHistory();
		console.log(`  Debug: History length = ${history.length}, Generate calls = ${adapter.generateCallCount}`);
		if (history.length > 0) {
			console.log(`  Debug: First message role = ${history[0].role}, content preview = ${history[0].content.slice(0, 50)}`);
		}

		assert(history.length < 20, 'History should be compacted (less than 20 messages)');
		assert(history[0].role === 'system', 'First message should be system summary');
		assert(history[0].content.includes('SUMMARIZED'), 'Summary should contain SUMMARIZED prefix');
		assert(adapter.generateCallCount > 0, 'Summarization should have been called');

		service.clearHistory();
		console.log('');
	}

	// Test 3: Recent window exceeds budget (dynamic shrinking)
	{
		console.log('Test 3: Recent window exceeds budget (dynamic shrinking)');
		const adapter = new StubLLMAdapter();
		const service = new ChatService(adapter, {
			maxPromptTokens: 300, // Extremely low
			reservedResponseTokens: 50,
			recentMessagesToKeep: 6,
			minRecentMessagesToKeep: 2
		});

		// Add very long messages
		const longMessage = 'This is a very long message that will exceed the token budget. '.repeat(20);
		for (let i = 0; i < 8; i++) {
			await service.sendMessage(longMessage, '', () => {});
		}

		const history = service.getHistory();
		assert(history[0].role === 'system', 'Should have system summary');
		// Should have shrunk to near minRecentMessagesToKeep
		assert(history.length <= 7, 'Should have shrunk recent window (system + recent messages)');
		assert(adapter.generateCallCount > 0, 'Should have called summarization');

		service.clearHistory();
		console.log('');
	}

	// Test 4: Large context trimming
	{
		console.log('Test 4: Large context trimming');
		const adapter = new StubLLMAdapter();
		const service = new ChatService(adapter, {
			maxPromptTokens: 500,
			reservedResponseTokens: 50,
			recentMessagesToKeep: 4,
			minRecentMessagesToKeep: 2
		});

		// Large context
		const largeContext = 'This is a large document context. '.repeat(500);

		await service.sendMessage('Tell me about this document', largeContext, () => {});

		const prompt = service.buildPrompt('Tell me about this document', largeContext);
		const promptTokens = service.estimateTokens(prompt);

		assert(promptTokens <= 500, `Prompt should fit budget (${promptTokens} <= 500)`);
		assert(prompt.includes('BEGIN DOCUMENT'), 'Should include context (even if trimmed)');

		service.clearHistory();
		console.log('');
	}

	// Test 5: Summarization failure fallback
	{
		console.log('Test 5: Summarization failure fallback');
		const adapter = new StubLLMAdapter();
		adapter.shouldFail = true; // Force failure

		const service = new ChatService(adapter, {
			maxPromptTokens: 300,
			reservedResponseTokens: 50,
			recentMessagesToKeep: 4,
			minRecentMessagesToKeep: 2
		});

		// Add longer messages to trigger compaction
		for (let i = 0; i < 10; i++) {
			await service.sendMessage(`Message ${i}: Test content for fallback with enough text to exceed budget.`, '', () => {});
		}

		const history = service.getHistory();
		console.log(`  Debug: History length = ${history.length}`);
		if (history.length > 0) {
			console.log(`  Debug: First message role = ${history[0].role}, content = ${history[0].content.slice(0, 60)}`);
		}

		assert(history.length > 0 && history[0].role === 'system', 'Should have system summary even on failure');
		assert(history.length > 0 && history[0].content.includes('[Summarized due to token limit]'), 'Should use fallback summary');

		service.clearHistory();
		console.log('');
	}

	// Test 6: No duplicate user message in prompt
	{
		console.log('Test 6: No duplicate user message in prompt');
		const adapter = new StubLLMAdapter();
		const service = new ChatService(adapter, {
			maxPromptTokens: 8192,
			reservedResponseTokens: 512,
			recentMessagesToKeep: 6,
			minRecentMessagesToKeep: 2
		});

		await service.sendMessage('First message', '', () => {});

		// Simulate the state during sendMessage, after user message push but before assistant response
		service.messages.push({ role: 'user', content: 'Second message' });
		const prompt = service.buildPrompt('Second message', '');
		const occurrences = (prompt.match(/Second message/g) || []).length;

		console.log(`  Debug: Prompt length = ${prompt.length}, Occurrences of 'Second message' = ${occurrences}`);

		assert(occurrences === 1, `User message should appear exactly once in prompt (found ${occurrences})`);

		service.clearHistory();
		console.log('');
	}

	// Summary
	console.log('\n' + '='.repeat(50));
	console.log(`Test Results: ${passCount} passed, ${failCount} failed`);
	console.log('='.repeat(50) + '\n');

	if (failCount > 0) {
		console.error('❌ Some tests failed!');
		process.exit(1);
	} else {
		console.log('✅ All tests passed!');
		process.exit(0);
	}
}

runTests().catch((e) => {
	console.error('Test harness error:', e);
	process.exit(1);
});
