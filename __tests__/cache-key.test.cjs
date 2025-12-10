const { normalizeContent, fileCompositeKey, depSignatureForDeps } = require('../dist/drift/cache-key.js');

describe('cache-key', () => {
  it('normalizes content removing whitespace and comments', () => {
    const content = `// a comment\nfunction foo() { /* inner */ return 1; }`;
    const norm = normalizeContent(content);
    expect(norm.includes('comment')).toBeFalsy();
    expect(norm.includes('function foo()')).toBeTruthy();
  });

  it('generates stable dep signatures', () => {
    const sig1 = depSignatureForDeps(['a.js', 'b.js']);
    const sig2 = depSignatureForDeps(['b.js', 'a.js']);
    expect(sig1).toEqual(sig2);
  });

  it('generates different keys for different tool versions', () => {
    const tool = { toolName: 'eslint', version: '8.0.0', config: { rules: { semi: 'off' } } };
    const key1 = fileCompositeKey('f1.ts', 'sample', tool, 'depsig');
    const tool2 = { toolName: 'eslint', version: '9.0.0', config: { rules: { semi: 'off' } } };
    const key2 = fileCompositeKey('f1.ts', 'sample', tool2, 'depsig');
    expect(key1).not.toEqual(key2);
  });
});
