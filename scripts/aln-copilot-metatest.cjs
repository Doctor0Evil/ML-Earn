#!/usr/bin/env node
/**
 * aln-copilot-metatest.cjs
 * 
 * Validates Copilot metaprompts and governance alignment.
 * Ensures required command IDs are present and no weakened phrases exist.
 */

const fs = require('fs');
const path = require('path');

const METAPROMPT_FILES = [
  'aln/github_copilot/Github-Copilot-Next-Steps-And-ALN-Interop.aln',
  'aln/github_copilot/aln-advanced-ci-expansion.aln'
];

const REQUIRED_COMMAND_IDS = [
  'validate_aln_ci_core',
  'enforce_aln_governance_block',
  'wire_vs_code_aln_support'
];

const DISALLOWED_PHRASES = [
  'reduce_severity_thresholds',
  'disable_governance_checks',
  'allow_python_in_ci',
  'weaken_constraints',
  'bypass_safety'
];

function runCopilotMetatest() {
  console.log('Running Copilot metaprompt tests...\n');

  let hasError = false;

  for (const file of METAPROMPT_FILES) {
    if (!fs.existsSync(file)) {
      console.warn(`⚠ Metaprompt file not found: ${file}`);
      continue;
    }

    const content = fs.readFileSync(file, 'utf8');
    console.log(`Checking: ${file}`);

    // Check for required command IDs
    const missingCommands = REQUIRED_COMMAND_IDS.filter(cmd => !content.includes(cmd));
    if (missingCommands.length > 0) {
      console.error(`  ✗ Missing required command IDs:`);
      missingCommands.forEach(cmd => console.error(`    - ${cmd}`));
      hasError = true;
    } else {
      console.log(`  ✓ All required command IDs present`);
    }

    // Check for disallowed phrases
    const foundDisallowed = DISALLOWED_PHRASES.filter(phrase => 
      content.toLowerCase().includes(phrase.toLowerCase())
    );
    if (foundDisallowed.length > 0) {
      console.error(`  ✗ Disallowed phrases detected:`);
      foundDisallowed.forEach(phrase => console.error(`    - ${phrase}`));
      hasError = true;
    } else {
      console.log(`  ✓ No disallowed phrases found`);
    }

    console.log();
  }

  if (hasError) {
    console.error('✗ Copilot metaprompt tests FAILED.');
    process.exit(1);
  }

  console.log('✓ Copilot metaprompt tests passed.');
}

runCopilotMetatest();
