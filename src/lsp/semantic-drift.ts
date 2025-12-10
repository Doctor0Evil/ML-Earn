import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver-types';

// minimal drift heuristics: signature drift detection, contract drift detection
// This is a tiny skeleton that scans TypeScript source text for removed param hints (e.g., TODO: param removed)

export type DiagnosticEntry = {
  file: string;
  diagnostics: Diagnostic[];
};

export function analyzeForSemanticDrift(filePath: string, sourceText: string): DiagnosticEntry {
  const diagnostics: Diagnostic[] = [];
  // naive heuristics:
  // - if file contains "@removed-parameter" marker -> warning
  // - if file contains "@weakened-check" marker -> error
  const lines = sourceText.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('@removed-parameter')) {
      diagnostics.push({
        message: 'Signature drift: removed parameter marker detected',
        severity: DiagnosticSeverity.Warning,
        range: { start: { line: idx, character: 0 }, end: { line: idx, character: line.length } },
        source: 'semantic-drift',
        code: 'semantic-drift-signature',
      } as Diagnostic);
    }
    if (line.includes('@weakened-check')) {
      diagnostics.push({
        message: 'Contract drift: weakened check marker detected',
        severity: DiagnosticSeverity.Error,
        range: { start: { line: idx, character: 0 }, end: { line: idx, character: line.length } },
        source: 'semantic-drift',
        code: 'semantic-drift-contract',
      } as Diagnostic);
    }
  });
  return { file: filePath, diagnostics };
}
