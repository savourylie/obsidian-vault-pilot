/**
 * Headless test for OllamaAdapter.
 * Tests basic generation and streaming against a local Ollama instance.
 *
 * Prerequisites:
 * - Ollama running: ollama serve
 * - Model available: ollama pull llama3.2
 *
 * Run: node scripts/ollama-test.js
 */

// Simple LLM adapter implementation (copied from src/llm/OllamaAdapter.ts for Node.js testing)
class OllamaAdapter {
	constructor(baseUrl = 'http://localhost:11434', defaultModel = 'gemma3n:e2b') {
		this.baseUrl = baseUrl.replace(/\/$/, '');
		this.defaultModel = defaultModel;
	}

	async generate(prompt, options = {}) {
		const model = options.model ?? this.defaultModel;
		const temperature = options.temperature ?? 0.7;

		const response = await fetch(`${this.baseUrl}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model,
				prompt,
				temperature,
				stream: false,
			}),
		});

		if (!response.ok) {
			throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();
		return data.response || '';
	}

	async stream(prompt, onChunk, options = {}) {
		const model = options.model ?? this.defaultModel;
		const temperature = options.temperature ?? 0.7;
		const signal = options.signal;

		const response = await fetch(`${this.baseUrl}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model,
				prompt,
				temperature,
				stream: true,
			}),
			signal,
		});

		if (!response.ok) {
			throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
		}

		if (!response.body) {
			throw new Error('Response body is null');
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');

				for (let i = 0; i < lines.length - 1; i++) {
					const line = lines[i].trim();
					if (!line) continue;

					try {
						const json = JSON.parse(line);
						if (json.response) {
							onChunk(json.response);
						}
						if (json.done) {
							return;
						}
					} catch (err) {
						console.error('Failed to parse line:', line, err);
					}
				}

				buffer = lines[lines.length - 1];
			}
		} finally {
			reader.releaseLock();
		}
	}
}

// Test runner
async function runTests() {
	console.log('=== Ollama Adapter Tests ===\n');

	const adapter = new OllamaAdapter('http://localhost:11434', 'gemma3n:e2b');

	// Test 1: Connection check
	console.log('[Test 1] Checking Ollama connection...');
	try {
		const response = await fetch('http://localhost:11434/api/tags');
		if (!response.ok) {
			throw new Error('Ollama not responding');
		}
		const data = await response.json();
		console.log(`✓ Ollama is running with ${data.models?.length || 0} models`);
		if (data.models?.length > 0) {
			console.log(`  Available models: ${data.models.map(m => m.name).join(', ')}`);
		}
	} catch (err) {
		console.error('✗ FAIL: Ollama is not running or not accessible');
		console.error('  Please start Ollama: ollama serve');
		console.error('  Then pull a model: ollama pull llama3.2');
		process.exit(1);
	}

	// Test 2: Simple generation
	console.log('\n[Test 2] Testing generate() method...');
	try {
		const prompt = 'Say "Hello from Ollama!" and nothing else.';
		console.log(`  Prompt: "${prompt}"`);
		const result = await adapter.generate(prompt, { temperature: 0.1 });
		console.log(`  Response: "${result.trim()}"`);
		if (result && result.length > 0) {
			console.log('✓ PASS: generate() returned a response');
		} else {
			console.log('✗ FAIL: generate() returned empty response');
		}
	} catch (err) {
		console.error('✗ FAIL: generate() threw an error:', err.message);
	}

	// Test 3: Streaming
	console.log('\n[Test 3] Testing stream() method...');
	try {
		const prompt = 'Count from 1 to 5, one number per line.';
		console.log(`  Prompt: "${prompt}"`);
		console.log('  Streaming response:');

		const chunks = [];
		await adapter.stream(prompt, (chunk) => {
			chunks.push(chunk);
			process.stdout.write(chunk);
		}, { temperature: 0.1 });

		console.log('\n');
		if (chunks.length > 0) {
			console.log(`✓ PASS: stream() received ${chunks.length} chunks`);
		} else {
			console.log('✗ FAIL: stream() received no chunks');
		}
	} catch (err) {
		console.error('✗ FAIL: stream() threw an error:', err.message);
	}

	// Test 4: Error handling (invalid model)
	console.log('\n[Test 4] Testing error handling (invalid model)...');
	try {
		await adapter.generate('Test', { model: 'nonexistent-model-xyz' });
		console.log('✗ FAIL: Should have thrown an error for invalid model');
	} catch (err) {
		console.log(`✓ PASS: Error caught: ${err.message}`);
	}

	// Test 5: Cancellation
	console.log('\n[Test 5] Testing cancellation with AbortController...');
	try {
		const controller = new AbortController();
		const prompt = 'Write a very long story about a cat.';

		// Cancel after 500ms
		setTimeout(() => {
			console.log('  Aborting request...');
			controller.abort();
		}, 500);

		let chunkCount = 0;
		try {
			await adapter.stream(prompt, (chunk) => {
				chunkCount++;
				process.stdout.write('.');
			}, { signal: controller.signal });
			console.log('\n✗ FAIL: Stream should have been aborted');
		} catch (err) {
			if (err.name === 'AbortError') {
				console.log(`\n✓ PASS: Stream aborted successfully after ${chunkCount} chunks`);
			} else {
				console.log(`\n✗ FAIL: Unexpected error: ${err.message}`);
			}
		}
	} catch (err) {
		console.error('✗ FAIL: Cancellation test error:', err.message);
	}

	console.log('\n=== All Tests Complete ===');
}

runTests().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
