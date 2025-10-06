/*
  Headless test for session model context attachments (Ticket 25).
  Tests SessionManager with context file management:
  - Legacy migration (no contextFiles → [])
  - Legacy migration (contextFile → contextFiles)
  - addContextFiles with deduplication
  - removeContextFile
  - renameContextFile across all sessions
  - New session initialization
  - Export includes contextFiles
*/

// Recreate SessionManager and types based on src/services/SessionManager.ts
class SessionManager {
	constructor(persistedData) {
		this.data = persistedData || {
			sessions: {},
			activeSessionId: null,
		};

		// Migrate legacy sessions: ensure contextFiles is initialized
		for (const sessionId in this.data.sessions) {
			const session = this.data.sessions[sessionId];
			if (!session.contextFiles) {
				session.contextFiles = [];
				// Migrate singular contextFile if present
				if (session.contextFile) {
					session.contextFiles.push(session.contextFile);
				}
			}
		}
	}

	createSession(contextFile) {
		const now = Date.now();
		const id = `session_${now}`;
		const title = this.generateTitle(now);

		const session = {
			id,
			title,
			createdAt: now,
			lastActiveAt: now,
			messages: [],
			contextFile,
			contextFiles: [],
		};

		this.data.sessions[id] = session;
		this.data.activeSessionId = id;

		return session;
	}

	getActiveSession() {
		if (this.data.activeSessionId && this.data.sessions[this.data.activeSessionId]) {
			return this.data.sessions[this.data.activeSessionId];
		}

		return this.createSession();
	}

	switchSession(sessionId) {
		if (!this.data.sessions[sessionId]) {
			return null;
		}

		this.data.activeSessionId = sessionId;
		this.data.sessions[sessionId].lastActiveAt = Date.now();

		return this.data.sessions[sessionId];
	}

	getRecentSessions(limit = 15) {
		const sessions = Object.values(this.data.sessions);
		return sessions
			.sort((a, b) => b.lastActiveAt - a.lastActiveAt)
			.slice(0, limit);
	}

	updateSession(sessionId, messages) {
		if (!this.data.sessions[sessionId]) {
			return;
		}

		this.data.sessions[sessionId].messages = messages;
		this.data.sessions[sessionId].lastActiveAt = Date.now();

		const session = this.data.sessions[sessionId];
		if (this.isDefaultTitle(session.title) && messages.length > 0) {
			const firstUserMsg = messages.find(m => m.role === 'user');
			if (firstUserMsg) {
				session.title = this.generateTitleFromMessage(firstUserMsg.content);
			}
		}
	}

	deleteSession(sessionId) {
		delete this.data.sessions[sessionId];

		if (this.data.activeSessionId === sessionId) {
			this.data.activeSessionId = null;
		}
	}

	addContextFiles(sessionId, paths) {
		const session = this.data.sessions[sessionId];
		if (!session) {
			return;
		}

		// Deduplicate: only add paths not already present
		const existingSet = new Set(session.contextFiles);
		for (const path of paths) {
			if (!existingSet.has(path)) {
				session.contextFiles.push(path);
				existingSet.add(path);
			}
		}

		session.lastActiveAt = Date.now();
	}

	removeContextFile(sessionId, path) {
		const session = this.data.sessions[sessionId];
		if (!session) {
			return;
		}

		session.contextFiles = session.contextFiles.filter(p => p !== path);
		session.lastActiveAt = Date.now();
	}

	renameContextFile(oldPath, newPath) {
		for (const sessionId in this.data.sessions) {
			const session = this.data.sessions[sessionId];
			const index = session.contextFiles.indexOf(oldPath);
			if (index !== -1) {
				session.contextFiles[index] = newPath;
			}
		}
	}

	export() {
		return { ...this.data };
	}

	generateTitle(timestamp) {
		const date = new Date(timestamp);
		const formatted = date.toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
		});
		return `Chat - ${formatted}`;
	}

	generateTitleFromMessage(content) {
		const truncated = content.slice(0, 40).trim();
		return truncated.length < content.length ? `${truncated}...` : truncated;
	}

	isDefaultTitle(title) {
		return title.startsWith('Chat - ');
	}

	getActiveSessionId() {
		return this.data.activeSessionId;
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

	console.log('\n🧪 Starting Session Model Tests (Ticket 25)...\n');

	// Test 1: Legacy migration - no contextFiles
	{
		console.log('Test 1: Legacy migration - no contextFiles → []');
		const legacyData = {
			sessions: {
				'session_old': {
					id: 'session_old',
					title: 'Old Session',
					createdAt: 1234567890,
					lastActiveAt: 1234567890,
					messages: [],
					// No contextFiles field
				}
			},
			activeSessionId: 'session_old'
		};

		const manager = new SessionManager(legacyData);
		const session = manager.data.sessions['session_old'];

		assert(Array.isArray(session.contextFiles), 'contextFiles should be an array');
		assert(session.contextFiles.length === 0, 'contextFiles should be empty for legacy session');
		console.log('');
	}

	// Test 2: Legacy migration - contextFile → contextFiles
	{
		console.log('Test 2: Legacy migration - contextFile → contextFiles');
		const legacyData = {
			sessions: {
				'session_with_file': {
					id: 'session_with_file',
					title: 'Session with File',
					createdAt: 1234567890,
					lastActiveAt: 1234567890,
					messages: [],
					contextFile: 'notes/readme.md',
					// No contextFiles field
				}
			},
			activeSessionId: 'session_with_file'
		};

		const manager = new SessionManager(legacyData);
		const session = manager.data.sessions['session_with_file'];

		assert(Array.isArray(session.contextFiles), 'contextFiles should be an array');
		assert(session.contextFiles.length === 1, 'contextFiles should have 1 item');
		assert(session.contextFiles[0] === 'notes/readme.md', 'contextFiles should contain migrated contextFile');
		console.log('');
	}

	// Test 3: New session initialization
	{
		console.log('Test 3: New session initialization');
		const manager = new SessionManager();
		const session = manager.createSession();

		assert(Array.isArray(session.contextFiles), 'New session should have contextFiles array');
		assert(session.contextFiles.length === 0, 'New session contextFiles should be empty');
		console.log('');
	}

	// Test 4: addContextFiles with deduplication
	{
		console.log('Test 4: addContextFiles with deduplication');
		const manager = new SessionManager();
		const session = manager.createSession();
		const sessionId = session.id;

		manager.addContextFiles(sessionId, ['notes/file1.md', 'notes/file2.md']);
		assert(session.contextFiles.length === 2, 'Should have 2 files after first add');

		manager.addContextFiles(sessionId, ['notes/file2.md', 'notes/file3.md']);
		assert(session.contextFiles.length === 3, 'Should have 3 files (deduplicated file2.md)');
		assert(session.contextFiles.includes('notes/file1.md'), 'Should contain file1.md');
		assert(session.contextFiles.includes('notes/file2.md'), 'Should contain file2.md');
		assert(session.contextFiles.includes('notes/file3.md'), 'Should contain file3.md');

		const file2Count = session.contextFiles.filter(p => p === 'notes/file2.md').length;
		assert(file2Count === 1, 'file2.md should appear exactly once (deduplication)');
		console.log('');
	}

	// Test 5: removeContextFile
	{
		console.log('Test 5: removeContextFile');
		const manager = new SessionManager();
		const session = manager.createSession();
		const sessionId = session.id;

		manager.addContextFiles(sessionId, ['notes/file1.md', 'notes/file2.md', 'notes/file3.md']);
		assert(session.contextFiles.length === 3, 'Should have 3 files initially');

		manager.removeContextFile(sessionId, 'notes/file2.md');
		assert(session.contextFiles.length === 2, 'Should have 2 files after removal');
		assert(!session.contextFiles.includes('notes/file2.md'), 'file2.md should be removed');
		assert(session.contextFiles.includes('notes/file1.md'), 'file1.md should remain');
		assert(session.contextFiles.includes('notes/file3.md'), 'file3.md should remain');
		console.log('');
	}

	// Test 6: renameContextFile across all sessions
	{
		console.log('Test 6: renameContextFile across all sessions');
		const manager = new SessionManager();
		const session1 = manager.createSession();

		// Small delay to ensure unique timestamp-based IDs
		await new Promise(resolve => setTimeout(resolve, 2));
		const session2 = manager.createSession();

		manager.addContextFiles(session1.id, ['notes/old-name.md', 'notes/other.md']);
		manager.addContextFiles(session2.id, ['notes/old-name.md', 'notes/another.md']);

		manager.renameContextFile('notes/old-name.md', 'notes/new-name.md');

		// Retrieve sessions from manager to get updated references
		const updatedSession1 = manager.data.sessions[session1.id];
		const updatedSession2 = manager.data.sessions[session2.id];

		assert(updatedSession1.contextFiles.includes('notes/new-name.md'), 'Session 1 should have new name');
		assert(!updatedSession1.contextFiles.includes('notes/old-name.md'), 'Session 1 should not have old name');
		assert(updatedSession2.contextFiles.includes('notes/new-name.md'), 'Session 2 should have new name');
		assert(!updatedSession2.contextFiles.includes('notes/old-name.md'), 'Session 2 should not have old name');
		assert(updatedSession1.contextFiles.includes('notes/other.md'), 'Session 1 other files unchanged');
		assert(updatedSession2.contextFiles.includes('notes/another.md'), 'Session 2 other files unchanged');
		console.log('');
	}

	// Test 7: Export includes contextFiles
	{
		console.log('Test 7: Export includes contextFiles');
		const manager = new SessionManager();
		const session = manager.createSession();
		manager.addContextFiles(session.id, ['notes/file1.md']);

		const exported = manager.export();

		assert(exported.sessions[session.id].contextFiles, 'Exported session should have contextFiles');
		assert(Array.isArray(exported.sessions[session.id].contextFiles), 'Exported contextFiles should be array');
		assert(exported.sessions[session.id].contextFiles.length === 1, 'Exported contextFiles should have 1 item');
		assert(exported.sessions[session.id].contextFiles[0] === 'notes/file1.md', 'Exported contextFiles should contain file1.md');
		console.log('');
	}

	// Test 8: Add to non-existent session (graceful handling)
	{
		console.log('Test 8: Add to non-existent session (graceful handling)');
		const manager = new SessionManager();

		// Should not throw
		manager.addContextFiles('non-existent-id', ['notes/file.md']);
		manager.removeContextFile('non-existent-id', 'notes/file.md');

		assert(true, 'Should handle non-existent session gracefully');
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
