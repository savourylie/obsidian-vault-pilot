/*
  Headless TF-IDF fallback test for TaggingService (uses IndexingService stats).
*/
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

// Point 'obsidian' imports to our mocks
process.env.NODE_PATH = path.resolve(__dirname, 'mocks');
require('module').Module._initPaths();

function buildOne(entryRel, outName) {
  const entry = path.resolve(__dirname, '..', entryRel);
  const outdir = path.resolve(__dirname, '.tmp');
  fs.mkdirSync(outdir, { recursive: true });
  const outfile = path.join(outdir, outName);
  esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'es2018',
    outfile,
    external: ['obsidian'],
  });
  return outfile;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function run() {
  const taggingPath = buildOne('src/services/TaggingService.ts', 'tagging-service.cjs');
  const indexingPath = buildOne('src/services/IndexingService.ts', 'indexing-service.cjs');
  const svc = require(taggingPath);
  const { IndexingService } = require(indexingPath);
  const { Vault } = require('obsidian');

  // Build a stub vault with three notes
  const vault = new Vault();
  vault.addFile('A.md', '# Project X Planning\n\nResearch plan for quantum lattice and entanglement. #project-x');
  vault.addFile('B.md', '# Notes on Lattice\n\nLattice theory basics and applications.');
  vault.addFile('C.md', '# Timeline\n\nProject schedule and research milestones for lattice.');

  const app = { vault };
  const index = new IndexingService(app);
  await index.buildIndex();

  // Current note content (simulate an editor buffer)
  const content = 'Deep research on quantum lattice for Project X milestones. Planning and lattice topics overview.';
  const existing = new Set(['#project-x']);

  const suggestions = await svc.suggestTags(app, content, {
    useLLM: false,
    minSuggestions: 3,
    maxSuggestions: 5,
    indexStats: index,
  }, existing);

  assert(Array.isArray(suggestions), 'suggestions array');
  assert(suggestions.length >= 3 && suggestions.length <= 5, 'size 3-5');
  for (const t of suggestions) assert(/^#[a-z0-9][a-z0-9-]*$/.test(t), 'normalized hashtag');
  assert(!suggestions.includes('#project-x'), 'excluded existing tag');

  console.log('Tagging TF-IDF test: PASS');
}

run().catch((e) => {
  console.error('Tagging TF-IDF test: FAIL');
  console.error(e && e.stack || e);
  process.exit(1);
});

