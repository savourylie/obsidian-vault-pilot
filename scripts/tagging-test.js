#!/usr/bin/env node
// Headless Tagging tests (Ticket 40)
// Wrapper that runs the unit tests for TaggingService
try {
  require('./tagging-unit-test.js');
} catch (e) {
  console.error('Tagging tests failed to start:', e && e.stack || e);
  process.exit(1);
}

