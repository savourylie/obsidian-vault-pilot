/*
  Headless unit tests for TaggingService helpers (Ticket 33).
  - Bundles the TS module via esbuild to a CJS file under scripts/.tmp
  - Asserts PASS/FAIL with clear console output
*/
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

function buildModule() {
  const src = path.resolve(__dirname, '..', 'src', 'services', 'TaggingService.ts');
  const outdir = path.resolve(__dirname, '.tmp');
  fs.mkdirSync(outdir, { recursive: true });
  const outfile = path.join(outdir, 'tagging-service.cjs');
  esbuild.buildSync({
    entryPoints: [src],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'es2018',
    outfile,
  });
  return outfile;
}

function toSortedArray(set) {
  return Array.from(set).sort();
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function run() {
  const modPath = buildModule();
  const svc = require(modPath);

  // normalizeTag
  assert(svc.normalizeTag('  #Project_X  ') === '#project-x', 'normalize basic failed');
  assert(svc.normalizeTag('FoO   Bar') === '#foo-bar', 'normalize whitespace failed');
  assert(svc.normalizeTag('!!!') === '', 'normalize invalid should be empty');

  // extractInlineTags
  const inline = svc.extractInlineTags('Foo #Bar baz #bar #x-y and #x_y');
  assert(JSON.stringify(toSortedArray(inline)) === JSON.stringify(['#bar', '#x-y']), 'extractInlineTags failed');

  // extractFrontmatterTags (array)
  const fm1 = svc.extractFrontmatterTags('---\ntags: [Project X, research]\n---\nBody');
  assert(JSON.stringify(toSortedArray(fm1)) === JSON.stringify(['#project-x', '#research']), 'frontmatter array failed');

  // extractFrontmatterTags (list)
  const fm2 = svc.extractFrontmatterTags('---\ntags:\n - Alpha\n - Beta-1\n---\nBody');
  assert(JSON.stringify(toSortedArray(fm2)) === JSON.stringify(['#alpha', '#beta-1']), 'frontmatter list failed');

  // mergeTagsIntoContent — empty note
  let res = svc.mergeTagsIntoContent('', ['#Alpha']);
  assert(res.changed === true, 'merge empty changed flag');
  assert(res.content === '#alpha', 'merge empty content');

  // mergeTagsIntoContent — append new line
  res = svc.mergeTagsIntoContent('Some text', ['#Alpha', ' #beta ']);
  assert(res.content.endsWith('\n#alpha #beta\n'), 'merge append at EOF');

  // mergeTagsIntoContent — merge existing line
  res = svc.mergeTagsIntoContent('x\n#alpha\n', ['#alpha', '#beta']);
  assert(/#alpha #beta\n$/.test(res.content), 'merge existing tag line');

  // scanVaultTags — stub app
  const docA = { path: 'A.md', extension: 'md' };
  const docB = { path: 'B.md', extension: 'md' };
  const mem = new Map([
    [docA.path, '---\ntags: [Project X]\n---\nbody #Research'],
    [docB.path, 'no fm\n#project-x other #misc'],
  ]);
  const app = {
    vault: {
      getMarkdownFiles() { return [docA, docB]; },
      async read(file) { return mem.get(file.path) || ''; },
    }
  };
  return svc.scanVaultTags(app).then(async (counts) => {
    assert(counts.get('#project-x') === 2, 'scan count project-x');
    assert(counts.get('#research') === 1, 'scan count research');

    // suggestTags fallback (LLM disabled)
    const existing = new Set(['#project-x']);
    const suggestions = await svc.suggestTags(app, 'This is about Project X research planning and timeline.', {
      useLLM: false,
      minSuggestions: 3,
      maxSuggestions: 5,
    }, existing);
    assert(Array.isArray(suggestions), 'suggestions array');
    assert(suggestions.length >= 1 && suggestions.length <= 5, 'suggestions size within bounds');
    for (const t of suggestions) {
      assert(/^#[a-z0-9][a-z0-9-]*$/.test(t), 'normalized hashtag format');
      assert(!existing.has(t), 'does not include existing tag');
    }

    // suggestTags with LLM requested but absent -> fallback
    const suggestions2 = await svc.suggestTags(app, 'Strategy and research outline for Project X.', {
      useLLM: true,
      // no ollamaUrl provided; should fallback
      minSuggestions: 3,
      maxSuggestions: 5,
    }, new Set(['#project-x']));
    assert(suggestions2.length >= 1, 'llm fallback produced suggestions');

    // LLM stub returns non-hashtag output -> should fallback
    const stubAdapter = {
      async generate() {
        return 'Here are some tags you could use: project x, research, planning';
      },
      async stream() { /* not used */ },
    };
    const suggestions3 = await svc.suggestTags(app, 'Deep dive into Project X research planning', {
      useLLM: true,
      llmAdapter: stubAdapter,
      minSuggestions: 3,
      maxSuggestions: 5,
    }, new Set(['#project-x']));
    assert(suggestions3.length >= 3, 'stub non-hashtag fallback met min');
    for (const t of suggestions3) assert(/^#[a-z0-9][a-z0-9-]*$/.test(t), 'normalized hashtag');
  });
}

try {
  Promise.resolve(run()).then(() => {
    console.log('Tagging unit test: PASS');
  }).catch((e) => {
    throw e;
  });
} catch (e) {
  console.error('Tagging unit test: FAIL');
  console.error(e && e.stack || e);
  process.exit(1);
}
