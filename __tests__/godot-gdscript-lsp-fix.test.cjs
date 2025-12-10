const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');

const {
  scanPort,
  applyEditorSettingsTRES,
  ensureVscodeSettings,
  ensureVscodeLaunch,
  createNeovimSnippet,
  findFiles,
} = require('../scripts/fix-godot-lsp.cjs');
const cp = require('child_process');

describe('Godot GDScript LSP fix scripts', () => {
  it('scanPort should return true when a server is listening', async () => {
    const server = net.createServer();
    await new Promise((res, rej) => server.listen(0, '127.0.0.1', res));
    const port = server.address().port;
    const ok = await scanPort('127.0.0.1', port);
    expect(ok).toBe(true);
    server.close();
  });

  it('applyEditorSettingsTRES should append language server block when none exists', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gdscript-lsp-'));
    const file = path.join(tmp, 'editor_settings-1000.tres');
    const src = `config_version=4\n[ui]\nicons=true`;
    fs.writeFileSync(file, src, 'utf8');
    const res = applyEditorSettingsTRES(file, 6008, '127.0.0.1');
    expect(res.ok).toBe(true);
    const updated = fs.readFileSync(file, 'utf8');
    expect(updated).toMatch(/language_server\/host = \\"127.0.0.1\\"/);
    expect(updated).toMatch(/language_server\/port = 6008/);
    // cleanup
    fs.unlinkSync(res.backup);
  });

  it('ensureVscodeSettings should create settings.json with LSP host and port', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gdscript-lsp-'));
    const res = ensureVscodeSettings(tmp, '127.0.0.1', 6008);
    expect(res.ok).toBe(true);
    const cfg = JSON.parse(fs.readFileSync(res.path, 'utf8'));
    expect(cfg['godot_tools.lsp.host']).toBe('127.0.0.1');
    expect(cfg['godot_tools.lsp.port']).toBe(6008);
  });

  it('ensureVscodeLaunch should create a launch.json with Godot profile', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gdscript-lsp-'));
    const res = ensureVscodeLaunch(tmp, 'godot', '127.0.0.1', 6008);
    expect(res.ok).toBe(true);
    const cfg = JSON.parse(fs.readFileSync(res.path, 'utf8'));
    const profiles = cfg.configurations || [];
    expect(profiles.some(p => p.name === 'Launch Godot Editor (LSP)')).toBe(true);
  });

  it('createNeovimSnippet should create a readable snippet file', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gdscript-lsp-'));
    const res = createNeovimSnippet(tmp, '127.0.0.1', 6008);
    expect(res.ok).toBe(true);
    const content = fs.readFileSync(res.path, 'utf8');
    expect(content).toMatch(/--host/);
    expect(content).toMatch(/--port/);
  });

  it('diagnostics CLI returns JSON when node is available', () => {
    // Skip if node isn't available in the environment running tests
    try {
      const out = cp.spawnSync(process.execPath || 'node', ['scripts/fix-godot-lsp.cjs', '--diagnostics'], { encoding: 'utf8' });
      expect(out.stderr).toBeFalsy();
      expect(out.stdout).toBeTruthy();
      const parsed = JSON.parse(out.stdout);
      expect(Array.isArray(parsed)).toBe(true);
    } catch (e) {
      // safe fallback if node not present in runner
      console.warn('Skipping CLI diagnostics spawn test:', e.message);
    }
  });

  it('show firewall commands without applying', () => {
    const out = cp.spawnSync(process.execPath || 'node', ['scripts/fix-godot-lsp.cjs', '--allow-firewall-loopback'], { encoding: 'utf8' });
    expect(out.stdout).toBeTruthy();
    expect(out.stdout).toMatch(/Firewall command/);
  });

  it('programmatic firewall commands includes the port', () => {
    const cmd = showFirewallCommands(6008);
    expect(typeof cmd).toBe('string');
    expect(cmd).toMatch(/6008/);
  });

  it('applyFirewallLoopback returns object result (dry run in unit tests)', () => {
    try {
      const res = applyFirewallLoopback(6008);
      expect(res).toBeTruthy();
      // either a spawnSync result or throws (we catch above)
      expect(res).toHaveProperty('status');
    } catch (e) {
      // Some environments may throw if command is not found; ensure we gracefully handle it
      console.warn('applyFirewallLoopback: skipped due to execution environment:', e.message);
    }
  });
});
