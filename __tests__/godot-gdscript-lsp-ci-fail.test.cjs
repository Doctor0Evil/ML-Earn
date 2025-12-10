const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

describe('Godot LSP CI-fail diagnostics', () => {
  it('emits ::error lines and non-zero exit when mismatched ports', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gdscript-ci-'));
    fs.mkdirSync(path.join(tmp, '.vscode'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.vscode', 'settings.json'), JSON.stringify({ 'godot_tools.gdscript_lsp.server_port': 6000 }), 'utf8');
    fs.writeFileSync(path.join(tmp, 'editor_settings-100.tres'), '[network]\nlanguage_server/host = \"127.0.0.1\"\nlanguage_server/port = 6000\n', 'utf8');
    fs.writeFileSync(path.join(tmp, 'godot_lsp.config.json'), JSON.stringify({ defaultPort: 6008 }), 'utf8');

    const out = cp.spawnSync(process.execPath || 'node', ['../scripts/fix-godot-lsp.cjs', '--ci-fail'], { cwd: tmp, encoding: 'utf8' });
    expect(out.status).not.toBe(0);
    expect(out.stdout + out.stderr).toMatch(/::error/);
  });
});
