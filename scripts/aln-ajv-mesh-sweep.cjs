#!/usr/bin/env node
/**
 * aln-ajv-mesh-sweep.cjs
 * 
 * Runs Ajv validation across all ALN JSON projections.
 * Enforces schema compliance for CI gates.
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

const SCHEMA_DIR = 'schemas';
const ALN_JSON_DIR = 'aln-json';

async function runAjvMeshSweep() {
  console.log('Starting Ajv mesh sweep...');

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  // Load all schemas
  const schemaFiles = fs.readdirSync(SCHEMA_DIR).filter(f => f.endsWith('.json'));
  const validators = [];

  for (const schemaFile of schemaFiles) {
    try {
      const schemaPath = path.join(SCHEMA_DIR, schemaFile);
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      const validate = ajv.compile(schema);
      validators.push({ name: schemaFile, validate });
      console.log(`✓ Loaded schema: ${schemaFile}`);
    } catch (err) {
      console.error(`✗ Failed to load schema ${schemaFile}:`, err.message);
      process.exit(1);
    }
  }

  // Find all ALN JSON projections
  const jsonFiles = await glob(`${ALN_JSON_DIR}/**/*.json`);
  console.log(`Found ${jsonFiles.length} JSON projection files`);

  let hasError = false;
  const violations = [];

  for (const jsonFile of jsonFiles) {
    try {
      const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
      
      for (const { name, validate } of validators) {
        const valid = validate(data);
        if (!valid) {
          console.error(`\n✗ Validation failed for ${jsonFile} against ${name}:`);
          console.error(JSON.stringify(validate.errors, null, 2));
          
          violations.push({
            file: jsonFile,
            schema: name,
            errors: validate.errors
          });
          hasError = true;
        }
      }
    } catch (err) {
      console.error(`✗ Failed to validate ${jsonFile}:`, err.message);
      hasError = true;
    }
  }

  // Write violation report for severity gate
  const reportDir = 'reports';
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const report = {
    timestamp: new Date().toISOString(),
    total_files: jsonFiles.length,
    violations: violations.map(v => ({
      file: v.file,
      schema: v.schema,
      severity: determineSeverity(v.errors),
      errors: v.errors
    }))
  };

  fs.writeFileSync(
    path.join(reportDir, 'aln-constraint-report.json'),
    JSON.stringify(report, null, 2)
  );

  if (hasError) {
    console.error('\n✗ Ajv mesh sweep failed with validation errors.');
    process.exit(1);
  }

  console.log('\n✓ Ajv mesh sweep passed.');
}

function determineSeverity(errors) {
  // Critical: missing required fields, type mismatches
  const criticalKeywords = ['required', 'type', 'enum'];
  
  for (const error of errors) {
    if (criticalKeywords.includes(error.keyword)) {
      return 'critical';
    }
  }

  return 'high';
}

runAjvMeshSweep().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
