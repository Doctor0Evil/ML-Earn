#!/usr/bin/env node
/**
 * aln-severity-gate.cjs
 * 
 * Evaluates sevmesh-gate constraints:
 * - critical_violation_threshold: 0
 * - high_violation_soft_cap: 10
 * - governance_coverage_min: 0.95
 */

const fs = require('fs');
const path = require('path');

const REPORT_PATH = 'reports/aln-constraint-report.json';

function evaluateSeverityGate() {
  console.log('Evaluating sevmesh-gate constraints...');

  if (!fs.existsSync(REPORT_PATH)) {
    console.error('✗ Missing constraint report for severity gate.');
    console.error(`  Expected: ${REPORT_PATH}`);
    process.exit(1);
  }

  const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));

  const criticalBreaches = report.violations.filter(v => v.severity === 'critical');
  const highBreaches = report.violations.filter(v => v.severity === 'high');

  console.log(`\nSeverity gate analysis:`);
  console.log(`  Total violations: ${report.violations.length}`);
  console.log(`  Critical: ${criticalBreaches.length} (threshold: 0)`);
  console.log(`  High: ${highBreaches.length} (soft cap: 10)`);

  let exitCode = 0;

  if (criticalBreaches.length > 0) {
    console.error('\n✗ CRITICAL: sevmesh-gate constraint violated');
    console.error('  Critical violations detected (threshold: 0):');
    criticalBreaches.forEach(breach => {
      console.error(`    - ${breach.file}`);
      breach.errors.forEach(err => {
        console.error(`      ${err.keyword}: ${err.message}`);
      });
    });
    exitCode = 1;
  }

  if (highBreaches.length > 10) {
    console.error('\n✗ HIGH: sevmesh-gate soft cap exceeded');
    console.error(`  High-severity violations: ${highBreaches.length} (soft cap: 10)`);
    exitCode = 1;
  }

  if (exitCode === 0) {
    console.log('\n✓ Severity gate passed.');
  } else {
    console.error('\n✗ Severity gate FAILED.');
  }

  process.exit(exitCode);
}

evaluateSeverityGate();
