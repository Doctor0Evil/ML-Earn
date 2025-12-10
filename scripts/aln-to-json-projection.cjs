#!/usr/bin/env node
/**
 * aln-to-json-projection.cjs
 * 
 * Converts .aln documents into deterministic aln-json-projection files
 * for Ajv validation and CI integration.
 * 
 * Runtime: Node.js 16+ (non-Python)
 * Input: aln/**\/*.aln
 * Output: aln-json/*.json
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

const ALN_DIR = 'aln';
const JSON_OUTPUT_DIR = 'aln-json';

async function convertAlnToJson() {
  console.log('Starting ALN to JSON projection conversion...');

  // Ensure output directory exists
  if (!fs.existsSync(JSON_OUTPUT_DIR)) {
    fs.mkdirSync(JSON_OUTPUT_DIR, { recursive: true });
  }

  // Find all .aln files
  const alnFiles = await glob(`${ALN_DIR}/**/*.aln`);
  console.log(`Found ${alnFiles.length} .aln files`);

  for (const alnFile of alnFiles) {
    try {
      const content = fs.readFileSync(alnFile, 'utf8');
      
      // Basic projection (placeholder for full ALN parser)
      const projection = {
        projection_meta: {
          source_file: alnFile,
          converted_utc: new Date().toISOString(),
          profile: 'aln-json-projection',
          version: '1.0'
        },
        aln_sections: extractSections(content),
        aln_terms: extractTerms(content),
        raw_content_hash: hashContent(content)
      };

      // Generate output path
      const relativePath = path.relative(ALN_DIR, alnFile);
      const outputPath = path.join(JSON_OUTPUT_DIR, relativePath.replace('.aln', '.json'));
      const outputDir = path.dirname(outputPath);

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      fs.writeFileSync(outputPath, JSON.stringify(projection, null, 2));
      console.log(`✓ Converted: ${alnFile} -> ${outputPath}`);
    } catch (err) {
      console.error(`✗ Failed to convert ${alnFile}:`, err.message);
      process.exit(1);
    }
  }

  console.log('ALN to JSON projection conversion complete.');
}

function extractSections(content) {
  const sections = [];
  const sectionRegex = /section\s+"([^"]+)"\s*\{/g;
  let match;

  while ((match = sectionRegex.exec(content)) !== null) {
    sections.push({
      id: match[1],
      type: 'section'
    });
  }

  return sections;
}

function extractTerms(content) {
  const terms = [];
  const termRegex = /term\s+"([^"]+)"\s*\{/g;
  let match;

  while ((match = termRegex.exec(content)) !== null) {
    terms.push({
      id: match[1],
      type: 'term'
    });
  }

  return terms;
}

function hashContent(content) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(content).digest('hex');
}

convertAlnToJson().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
