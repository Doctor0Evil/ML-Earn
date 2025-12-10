const { analyzeForSemanticDrift } = require('../dist/lsp/semantic-drift.js');

describe('LSP semantic drift heuristics', () => {
  it('emits diagnostics for markers', () => {
    const src = ['function foo() {', '  // @removed-parameter', '  return 1;', '}'].join('\n');
    const diag = analyzeForSemanticDrift('test.ts', src);
    expect(diag.diagnostics.length).toBeGreaterThan(0);
    expect(diag.diagnostics[0].message).toMatch(/Signature drift/);
  });
});
