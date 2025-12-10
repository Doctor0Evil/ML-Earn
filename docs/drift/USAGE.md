# Using the Drift Utilities

This outlines how to use the `Drift` utilities exported from the package.

Example (in TypeScript):

```ts
import { Drift } from 'github-solutions-aln';

// Build graph
const g = new Drift.DependencyGraph();
g.addModule('mA');
g.addModule('mB');
g.addModuleDependency('mA', 'mB');
// Link files
g.linkFileToModule('src/foo.ts', 'mA');

// Get impacted files when 'src/foo.ts' changes
const closure = g.getReverseClosure(new Set(['src/foo.ts']));

// Compute TIA
const analyzer = new Drift.TestImpactAnalyzer();
// coverage: module -> tests
analyzer.addCoverage('mA', 'test:foo');
// history: recorded failure
analyzer.recordHistoricalFail('src/foo.ts', 'test:bar');
const tests = analyzer.impactedTestsForFiles(new Map([['src/foo.ts', ['mA']]]));
console.log('Impacted tests', tests);

// Composite keys
const key = Drift.fileCompositeKey('src/foo.ts', "console.log(1)", {toolName:'eslint', version:'8.0.0', config:{}}, 'depsig');
console.log(key);
```

This prototype is a starting point. Implementations should integrate the dependency graph with a build or analysis backend and wire the TIA to a cache and a test orchestration engine.
