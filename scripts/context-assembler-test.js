/**
 * Headless test for ContextAssembler.
 * Tests prompt formatting with mocked retrieval results.
 *
 * Run: node scripts/context-assembler-test.js
 */

// Mock classes
class MockApp {
	constructor() {}
}

class MockRetrievalService {
	search(query, opts) {
		// Return mock results
		return [
			{
				path: 'notes/related-note-1.md',
				title: 'Related Note 1',
				snippet: 'This is a relevant snippet from the first note.',
				score: 0.95,
				file: null,
			},
			{
				path: 'notes/related-note-2.md',
				title: 'Related Note 2',
				snippet: 'Another important piece of information from note 2.',
				score: 0.87,
				file: null,
			},
			{
				path: 'current-file.md', // This should be filtered out
				title: 'Current File',
				snippet: 'This should not appear in context.',
				score: 0.99,
				file: null,
			},
		];
	}
}

class MockFile {
	constructor(path, basename) {
		this.path = path;
		this.basename = basename;
	}
}

// Simple ContextAssembler implementation (matches src/services/ContextAssembler.ts)
class ContextAssembler {
	constructor(app, retrieval, config = {}) {
		this.app = app;
		this.retrieval = retrieval;
		this.config = {
			maxSnippets: config.maxSnippets ?? 5,
			maxPromptLength: config.maxPromptLength ?? 8000,
			maxSelectionLength: config.maxSelectionLength ?? 2000,
		};
	}

	assembleContext(selection, file, instruction) {
		let truncatedSelection = selection;
		if (selection.length > this.config.maxSelectionLength) {
			truncatedSelection = selection.slice(0, this.config.maxSelectionLength) + '…';
		}

		const results = this.retrieval
			.search(selection, { limit: this.config.maxSnippets })
			.filter((r) => r.path !== file.path);

		let contextSection = '';
		if (results.length > 0) {
			contextSection = 'Relevant context from vault:\n';
			for (const result of results) {
				contextSection += `---\nSource: [[${result.title}]]\n${result.snippet}\n`;
			}
		} else {
			contextSection = 'No additional context from vault.\n';
		}

		const prompt = `You are an AI writing assistant for Obsidian. Your task is to help the user edit their note.

Current note: [[${file.basename}]]
Path: ${file.path}

${contextSection}
User's selection:
"""
${truncatedSelection}
"""

Instruction: ${instruction}

Provide your response as a direct replacement for the user's selection. Do not include explanations or preamble.`;

		if (prompt.length > this.config.maxPromptLength) {
			return prompt.slice(0, this.config.maxPromptLength) + '\n\n[Prompt truncated due to length]';
		}

		return prompt;
	}
}

// Test runner
function runTests() {
	console.log('=== ContextAssembler Tests ===\n');

	const mockApp = new MockApp();
	const mockRetrieval = new MockRetrievalService();
	const assembler = new ContextAssembler(mockApp, mockRetrieval);

	// Test 1: Basic prompt assembly
	console.log('[Test 1] Basic prompt assembly...');
	const mockFile = new MockFile('current-file.md', 'Current File');
	const selection = 'This is my selected text that needs editing.';
	const instruction = 'Rewrite this to be more concise.';

	const prompt = assembler.assembleContext(selection, mockFile, instruction);

	// Verify prompt structure
	let pass = true;
	if (!prompt.includes('Current note: [[Current File]]')) {
		console.log('✗ FAIL: Missing current note title');
		pass = false;
	}
	if (!prompt.includes('Path: current-file.md')) {
		console.log('✗ FAIL: Missing file path');
		pass = false;
	}
	if (!prompt.includes('This is my selected text')) {
		console.log('✗ FAIL: Missing user selection');
		pass = false;
	}
	if (!prompt.includes('Rewrite this to be more concise')) {
		console.log('✗ FAIL: Missing instruction');
		pass = false;
	}
	if (!prompt.includes('[[Related Note 1]]')) {
		console.log('✗ FAIL: Missing context from related notes');
		pass = false;
	}
	if (prompt.includes('Current File') && prompt.match(/\[\[Current File\]\]/g).length > 1) {
		console.log('✗ FAIL: Current file should be filtered from context');
		pass = false;
	}

	if (pass) {
		console.log('✓ PASS: Prompt structure is correct');
	}

	// Test 2: Long selection truncation
	console.log('\n[Test 2] Long selection truncation...');
	const longSelection = 'x'.repeat(3000);
	const prompt2 = assembler.assembleContext(longSelection, mockFile, instruction);

	if (prompt2.includes('x'.repeat(2000) + '…')) {
		console.log('✓ PASS: Long selection truncated correctly');
	} else {
		console.log('✗ FAIL: Long selection not truncated');
	}

	// Test 3: Empty retrieval results
	console.log('\n[Test 3] Empty retrieval results...');
	const emptyRetrieval = {
		search: () => [],
	};
	const assembler2 = new ContextAssembler(mockApp, emptyRetrieval);
	const prompt3 = assembler2.assembleContext(selection, mockFile, instruction);

	if (prompt3.includes('No additional context from vault')) {
		console.log('✓ PASS: Handles empty results gracefully');
	} else {
		console.log('✗ FAIL: Does not handle empty results');
	}

	// Test 4: Max prompt length truncation
	console.log('\n[Test 4] Max prompt length truncation...');
	const shortConfig = { maxPromptLength: 100 };
	const assembler3 = new ContextAssembler(mockApp, mockRetrieval, shortConfig);
	const prompt4 = assembler3.assembleContext(selection, mockFile, instruction);

	if (prompt4.length <= 150 && prompt4.includes('[Prompt truncated due to length]')) {
		console.log('✓ PASS: Prompt truncated when exceeding max length');
	} else {
		console.log('✗ FAIL: Prompt not truncated properly');
	}

	// Test 5: Display sample prompt
	console.log('\n[Test 5] Sample prompt output:');
	console.log('─'.repeat(60));
	console.log(prompt.slice(0, 500) + '\n...\n');
	console.log('─'.repeat(60));
	console.log(`✓ Total prompt length: ${prompt.length} chars`);

	console.log('\n=== All Tests Complete ===');
}

runTests();
