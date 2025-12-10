import crypto from 'crypto';

export interface ToolInfo {
  toolName: string;
  version: string;
  config: Record<string, unknown>;
}

export function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

export function normalizeContent(content: string): string {
  // quick whitespace/comment removal for JS/TS/JSON heuristics.
  // This is intentionally conservative and can be replaced with a language parser.
  return content
    .replace(/\/\/.*$/gm, '') // remove // style comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // remove /* */
    .replace(/\s+/g, ' ')
    .trim();
}

export function fileCompositeKey(filePath: string, content: string, tool: ToolInfo, depSignature: string): string {
  const hc = hashContent(content);
  const cn = JSON.stringify(tool.config || {});
  const cp = `${tool.toolName}:${tool.version}:${hc}:${depSignature}:${cn}`;
  return crypto.createHash('sha256').update(cp).digest('hex');
}

export function depSignatureForDeps(files: string[]): string {
  const sorted = Array.from(files).sort();
  return hashContent(sorted.join(','));
}
