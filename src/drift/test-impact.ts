import { FileId, ModuleId } from './dependency-graph';

export type TestId = string;

export interface CoverageRecord {
  // the set of test ids that touch each module
  moduleToTests: Map<ModuleId, Set<TestId>>;
}

export interface HistoryRecord {
  // historical fails mapping file->tests
  fileToTestFails: Map<FileId, Map<TestId, number>>;
}

export interface WeightsConfig {
  covFactor: number;
  histFactor: number;
  covScale: number;
  histScale: number;
  threshold: number;
}

export class TestImpactAnalyzer {
  private cov: CoverageRecord;
  private hist: HistoryRecord;
  private weights: WeightsConfig;

  constructor(cov?: Partial<CoverageRecord>, hist?: Partial<HistoryRecord>, weights?: Partial<WeightsConfig>) {
    this.cov = { moduleToTests: cov?.moduleToTests || new Map() };
    this.hist = { fileToTestFails: hist?.fileToTestFails || new Map() };
    this.weights = Object.assign({ covFactor: 1, histFactor: 1, covScale: 10, histScale: 10, threshold: 0.1 }, weights || {});
  }

  addCoverage(moduleId: ModuleId, testId: TestId) {
    if (!this.cov.moduleToTests.has(moduleId)) this.cov.moduleToTests.set(moduleId, new Set());
    this.cov.moduleToTests.get(moduleId)!.add(testId);
  }

  recordHistoricalFail(fileId: FileId, testId: TestId) {
    if (!this.hist.fileToTestFails.has(fileId)) this.hist.fileToTestFails.set(fileId, new Map());
    const map = this.hist.fileToTestFails.get(fileId)!;
    map.set(testId, (map.get(testId) || 0) + 1);
  }

  computeWeights(fileId: FileId, modules: ModuleId[]): Map<TestId, number> {
    const scores = new Map<TestId, number>();
    const histMap = this.hist.fileToTestFails.get(fileId);

    // coverage derived
    for (const m of modules) {
      const tests = this.cov.moduleToTests.get(m);
      if (!tests) continue;
      for (const t of tests) {
        const prev = scores.get(t) || 0;
        const add = 1 / (this.weights.covScale || 1);
        scores.set(t, prev + add * (this.weights.covFactor || 1));
      }
    }

    // history derived
    if (histMap) {
      for (const [t, cnt] of histMap.entries()) {
        const prev = scores.get(t) || 0;
        const add = Math.min(1, cnt / (this.weights.histScale || 1));
        scores.set(t, prev + add * (this.weights.histFactor || 1));
      }
    }

    return scores;
  }

  testsForFile(fileId: FileId, modules: ModuleId[]): { testId: TestId; score: number }[] {
    const scores = this.computeWeights(fileId, modules);
    const arr = Array.from(scores.entries()).map(([testId, score]) => ({ testId, score }));
    // thresholding
    return arr.filter((x) => x.score >= (this.weights.threshold || 0));
  }

  impactedTestsForFiles(filesToModules: Map<FileId, ModuleId[]>): { testId: TestId; score: number }[] {
    const combined: Map<TestId, number> = new Map();
    for (const [file, modules] of filesToModules.entries()) {
      const arr = this.testsForFile(file, modules);
      for (const r of arr) {
        const prev = combined.get(r.testId) || 0;
        combined.set(r.testId, prev + r.score);
      }
    }
    // return as array sorted by score desc
    return Array.from(combined.entries())
      .map(([testId, score]) => ({ testId, score }))
      .sort((a, b) => b.score - a.score);
  }
}
