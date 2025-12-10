const { DependencyGraph } = require('../dist/drift/dependency-graph.js');

describe('DependencyGraph', () => {
  it('should compute direct file deps and reverse closure', () => {
    const g = new DependencyGraph();
    // modules
    g.addModule('mA');
    g.addModule('mB');
    g.addModule('mC');
    // module deps: mA -> mB, mB -> mC
    g.addModuleDependency('mA', 'mB');
    g.addModuleDependency('mB', 'mC');
    // files
    g.linkFileToModule('fA', 'mA');
    g.linkFileToModule('fB', 'mB');
    g.linkFileToModule('fC', 'mC');

    const depsA = g.getDirectFileDeps('fA');
    expect(depsA.has('fB')).toBeTruthy();
    expect(depsA.has('fC')).toBeFalsy(); // direct only

    const closure = g.getReverseClosure(new Set(['fC']));
    // fB depends on fC, fA depends on fB, so reverse closure of fC includes fB and fA
    expect(closure.has('fA')).toBeTruthy();
    expect(closure.has('fB')).toBeTruthy();
    expect(closure.has('fC')).toBeTruthy();
  });
});
