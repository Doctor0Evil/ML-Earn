const fs = require('fs');
const path = require('path');
const os = require('os');
const { readRepoConfig, writeRepoConfig, validateConfigs, readFirewallPolicy, writeFirewallPolicy, computePolicyHash } = require('../scripts/fix-godot-lsp.cjs');
const cp = require('child_process');

describe('Advanced Godot LSP utilities', () => {
  it('can write and read repo config', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gdscript-lsp-'));
    const cfgPath = writeRepoConfig(tmp, { defaultPort: 6008 });
    expect(fs.existsSync(cfgPath)).toBe(true);
    const res = readRepoConfig(tmp);
    expect(res.cfg.defaultPort).toBe(6008);
  });

  it('validateConfigs returns issues for mismatched port & missing settings', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gdscript-lsp-'));
    // create a fake editor_settings.tres with a mismatch
    const tresPath = path.join(tmp, 'editor_settings-100.tres');
    fs.writeFileSync(tresPath, 'config_version=4\n[network]\nlanguage_server/host = "127.0.0.1"\nlanguage_server/port = 6000\n', 'utf8');
    // create a vscode settings.json with mismatch
    const vsDir = path.join(tmp, '.vscode');
    fs.mkdirSync(vsDir, { recursive: true });
    fs.writeFileSync(path.join(vsDir, 'settings.json'), JSON.stringify({ 'godot_tools.lsp.server_host': '127.0.0.1', 'godot_tools.lsp.port': 6000 }, null, 2), 'utf8');

    const issues = validateConfigs(tmp, 6008);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some(i => i.problem === 'port_mismatch')).toBe(true);
    expect(issues.some(i => i.problem === 'vscode_port_mismatch')).toBe(true);
  });

  it('firewall policy read/write and hash', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gdscript-lsp-'));
    const policy = { allow_firewall_apply: true, os: ["Windows_NT","Linux"], created: Date.now() };
    const ppath = writeFirewallPolicy(tmp, policy);
    const got = readFirewallPolicy(tmp);
    expect(got.allow_firewall_apply).toBe(true);
    const h = computePolicyHash(got);
    expect(typeof h).toBe('string');
  });

  it('cli --force-port and --save-config persists config', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gdscript-lsp-'));
    const out = cp.spawnSync(process.execPath || 'node', ['scripts/fix-godot-lsp.cjs', '--force-port', '6008', '--save-config', '--apply'], { cwd: tmp, encoding: 'utf8' });
    const cfg = readRepoConfig(tmp);
    expect(cfg.cfg.defaultPort).toBe(6008);
  });

  it('cli --ci-fail reports mismatch and exits non-zero', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gdscript-lsp-'));
    // create a mismatched editor_settings and vscode settings
    const tresPath = path.join(tmp, 'editor_settings-100.tres');
    fs.writeFileSync(tresPath, 'config_version=4\n[network]\nlanguage_server/host = "127.0.0.1"\nlanguage_server/port = 6000\n', 'utf8');
    const vsDir = path.join(tmp, '.vscode');
    fs.mkdirSync(vsDir, { recursive: true });
    fs.writeFileSync(path.join(vsDir, 'settings.json'), JSON.stringify({ 'godot_tools.lsp.server_host': '127.0.0.1', 'godot_tools.lsp.port': 6000 }, null, 2), 'utf8');
    const out = cp.spawnSync(process.execPath || 'node', ['scripts/fix-godot-lsp.cjs', '--ci-fail', '--force-port', '6008'], { cwd: tmp, encoding: 'utf8' });
    expect(out.status).not.toBe(0);
  });

  it('cli --ci-fail passes when config matches expected port', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gdscript-lsp-'));
    const tresPath = path.join(tmp, 'editor_settings-100.tres');
    fs.writeFileSync(tresPath, 'config_version=4\n[network]\nlanguage_server/host = "127.0.0.1"\nlanguage_server/port = 6008\n', 'utf8');
    const vsDir = path.join(tmp, '.vscode');
    fs.mkdirSync(vsDir, { recursive: true });
    fs.writeFileSync(path.join(vsDir, 'settings.json'), JSON.stringify({ 'godot_tools.lsp.server_host': '127.0.0.1', 'godot_tools.lsp.port': 6008 }, null, 2), 'utf8');
    // create a launch.json to avoid missing_vscode_launch error
    fs.writeFileSync(path.join(vsDir, 'launch.json'), JSON.stringify({ version: '0.2.0', configurations: [] }), 'utf8');
    const out = cp.spawnSync(process.execPath || 'node', ['scripts/fix-godot-lsp.cjs', '--ci-fail', '--force-port', '6008'], { cwd: tmp, encoding: 'utf8' });
    expect(out.status).toBe(0);
  });

  it('firewall apply requires policy opt-in and OS membership', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gdscript-lsp-'));
    // no policy should make CLI fail with code 2
    const out1 = cp.spawnSync(process.execPath || 'node', ['scripts/fix-godot-lsp.cjs', '--allow-firewall-loopback', '--confirm'], { cwd: tmp, encoding: 'utf8' });
    expect(out1.status).toBe(2);
    // policy present but no os list should fail (or, if os present but not matching)
    writeFirewallPolicy(tmp, { allow_firewall_apply: true, os: ['Not-My-OS'] });
    const out2 = cp.spawnSync(process.execPath || 'node', ['scripts/fix-godot-lsp.cjs', '--allow-firewall-loopback', '--confirm'], { cwd: tmp, encoding: 'utf8' });
    expect(out2.status).toBe(3);
    // now opt-in for the correct OS and simulate apply to avoid privileged operations
    const osType = os.type();
    writeFirewallPolicy(tmp, { allow_firewall_apply: true, os: [osType] });
    const out3 = cp.spawnSync(process.execPath || 'node', ['scripts/fix-godot-lsp.cjs', '--allow-firewall-loopback', '--confirm', '--simulate-apply', '--port', '6008'], { cwd: tmp, encoding: 'utf8' });
    expect(out3.status).toBe(0);
    const policy = readFirewallPolicy(tmp);
    expect(policy.lastAppliedHash).toBeTruthy();
  });
});
