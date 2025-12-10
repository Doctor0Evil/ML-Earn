const crypto = require('crypto');
#!/usr/bin/env node
// cjs script for Godot GDScript LSP fix operations
const fs = require('fs');
const path = require('path');
const net = require('net');

const HOST = '127.0.0.1';
const DEFAULT_PORT_6008 = 6008;
const DEFAULT_PORT_6005 = 6005;
const os = require('os');
const cp = require('child_process');

function scanPort(host, port, timeout = 750) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    socket.setTimeout(timeout);
    socket.on('connect', () => {
      settled = true;
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      if (!settled) { settled = true; socket.destroy(); resolve(false); }
    });
    socket.on('error', () => { if (!settled) { settled = true; socket.destroy(); resolve(false); } });
    socket.connect(port, host);
  });
}

function findFiles(startPath, pattern) {
  const results = [];
  function walk(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const full = path.join(dir, item);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) { walk(full); }
      else if (pattern.test(item)) { results.push(full); }
    }
  }
  try { walk(startPath); } catch (e) { }
  return results;
}

function applyEditorSettingsTRES(filePath, port = DEFAULT_PORT_6008, host = HOST) {
  // Read file and toggle language server settings in a tolerant way
  const content = fs.readFileSync(filePath, 'utf8');
  // Godot's editor_settings.tres may be in INI-like format. We'll attempt safe edits.
  // If language_server keys exist, replace; otherwise append a block.

  const hostKey = /network\s*:\s*language_server\/host\s*=\s*".*"/i;
  const portKey = /network\s*:\s*language_server\/port\s*=\s*\d+/i;
  let newContent = content;

  if (hostKey.test(content)) {
    newContent = newContent.replace(hostKey, `network: language_server/host = "${host}"`);
  }
  if (portKey.test(content)) {
    newContent = newContent.replace(portKey, `network: language_server/port = ${port}`);
  }
  if (!hostKey.test(content) && !portKey.test(content)) {
    const append = `\n[network]\nlanguage_server/host = \"${host}\"\nlanguage_server/port = ${port}\nlanguage_server/enable = true\n`; 
    newContent = content + append;
  }

  // Write a backup copy and then overwrite
  const bak = `${filePath}.bak-${Date.now()}`;
  fs.copyFileSync(filePath, bak);
  fs.writeFileSync(filePath, newContent, 'utf8');
  return { ok: true, backup: bak, filePath };
}

function ensureVscodeSettings(repoRoot, host = HOST, port = DEFAULT_PORT_6008) {
  const vsDir = path.join(repoRoot, '.vscode');
  if (!fs.existsSync(vsDir)) fs.mkdirSync(vsDir, { recursive: true });
  const settingsPath = path.join(vsDir, 'settings.json');
  let settings = {};
  try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (e) { settings = {}; }
  // Support both key variants: godot_tools.lsp.* and godot_tools.gdscript_lsp.*
  settings['godot_tools.lsp.host'] = host;
  settings['godot_tools.lsp.port'] = port;
  settings['godot_tools.gdscript_lsp.server_host'] = host;
  settings['godot_tools.gdscript_lsp.server_port'] = port;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  return { ok: true, path: settingsPath };
}

function ensureVscodeLaunch(repoRoot, godotBinary = 'godot', host = HOST, port = DEFAULT_PORT_6008) {
  const vsDir = path.join(repoRoot, '.vscode');
  if (!fs.existsSync(vsDir)) fs.mkdirSync(vsDir, { recursive: true });
  const launchPath = path.join(vsDir, 'launch.json');
  let launch = { version: '0.2.0', configurations: [] };
  try { launch = JSON.parse(fs.readFileSync(launchPath, 'utf8')); } catch (e) {}
  // Add a safe profile if missing
  const profileId = 'Launch Godot Editor (LSP)';
  if (!launch.configurations.some(c => c.name === profileId)) {
    launch.configurations.push({
      name: profileId,
      type: 'pwa-node',
      request: 'launch',
      program: godotBinary,
      args: ['--editor', '--lang_server', `--editor-lsp-port=${port}`],
      env: { 'GODOT_LSP_HOST': host }
    });
  }
  fs.writeFileSync(launchPath, JSON.stringify(launch, null, 2), 'utf8');
  return { ok: true, path: launchPath };
}

function createNeovimSnippet(repoRoot, host = HOST, port = DEFAULT_PORT_6008) {
  const nvimDir = path.join(repoRoot, 'nvim_gdscript_lsp_snippet');
  if (!fs.existsSync(nvimDir)) fs.mkdirSync(nvimDir, { recursive: true });
  const luaPath = path.join(nvimDir, 'gdscript_lsp.lua');
  const snippet = `local lspconfig = require('lspconfig')
lspconfig.gds.lua.setup({
  cmd = { 'gds-langserver', '--host', '${host}', '--port', '${port}' },
})\n`;
  fs.writeFileSync(luaPath, snippet, 'utf8');
  return { ok: true, path: luaPath };
}

function readRepoConfig(repoRoot) {
  const cfgPath = path.join(repoRoot, 'godot_lsp.config.json');
  try { const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); return { cfg, path: cfgPath }; } catch (e) { return { cfg: null, path: cfgPath }; }
}

function writeRepoConfig(repoRoot, cfg) {
  const cfgPath = path.join(repoRoot, 'godot_lsp.config.json');
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf8');
  return cfgPath;
}

function validateConfigs(repoRoot, expectedPort) {
  const issues = [];
  const tresFiles = findFiles(repoRoot, /^editor_settings.*\.tres$/i);
  // For each tres, check for language_server/port and host
  tresFiles.forEach((f) => {
    const content = fs.readFileSync(f, 'utf8');
    const portMatch = /language_server\/port\s*=\s*(\d+)/i.exec(content);
    const hostMatch = /language_server\/host\s*=\s*"([^"]+)"/i.exec(content);
    if (!portMatch) issues.push({ file: f, problem: 'missing_port' });
    else if (Number(portMatch[1]) !== expectedPort) issues.push({ file: f, problem: 'port_mismatch', port: Number(portMatch[1]) });
    if (!hostMatch) issues.push({ file: f, problem: 'missing_host' });
    else if (hostMatch[1] !== HOST) issues.push({ file: f, problem: 'host_mismatch', host: hostMatch[1] });
  });
  // check VS Code settings
  const settingsPath = path.join(repoRoot, '.vscode', 'settings.json');
  if (fs.existsSync(settingsPath)) {
    try {
      const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const portCandidates = [s['godot_tools.lsp.port'], s['godot_tools.gdscript_lsp.server_port'], s['godot_tools.gdscript_lsp.port']];
      const hostCandidates = [s['godot_tools.lsp.host'], s['godot_tools.gdscript_lsp.server_host'], s['godot_tools.gdscript_lsp.host']];
      const p = portCandidates.find(x => typeof x !== 'undefined');
      const h = hostCandidates.find(x => typeof x !== 'undefined');
      if (typeof p === 'undefined') issues.push({ file: settingsPath, problem: 'vscode_port_missing' });
      else if (Number(p) !== expectedPort) issues.push({ file: settingsPath, problem: 'vscode_port_mismatch', port: p });
      if (typeof h === 'undefined') issues.push({ file: settingsPath, problem: 'vscode_host_missing' });
      else if (h !== HOST) issues.push({ file: settingsPath, problem: 'vscode_host_mismatch', host: h });
    } catch (e) { issues.push({ file: settingsPath, problem: 'vscode_parse_error' }); }
  } else {
    issues.push({ file: settingsPath, problem: 'missing_vscode_settings' });
  }
  const launchPath = path.join(repoRoot, '.vscode', 'launch.json');
  if (!fs.existsSync(launchPath)) issues.push({ file: launchPath, problem: 'missing_vscode_launch' });
  return issues;
}

async function runDiagnostics(repoRoot) {
  const results = [];
  const p6008 = await scanPort(HOST, DEFAULT_PORT_6008);
  const p6005 = await scanPort(HOST, DEFAULT_PORT_6005);
  results.push({ port: DEFAULT_PORT_6008, reachable: p6008 });
  results.push({ port: DEFAULT_PORT_6005, reachable: p6005 });

  const tresFiles = findFiles(repoRoot, /^editor_settings.*\.tres$/i);
  results.push({ editor_settings_found: tresFiles.length, files: tresFiles });
  const vscodeSettings = fs.existsSync(path.join(repoRoot, '.vscode', 'settings.json'));
  results.push({ vscodeSettings });
  return results;
}

function showFirewallCommands(port = DEFAULT_PORT_6008) {
  const osType = os.type();
  if (osType === 'Windows_NT') {
    return `New-NetFirewallRule -DisplayName \"Allow Godot LSP ${port} Loopback\" -Direction Inbound -Action Allow -Protocol TCP -LocalPort ${port} -LocalAddress 127.0.0.1`;
  }
  // Default Linux snippet
  return `sudo iptables -A INPUT -i lo -p tcp --dport ${port} -j ACCEPT`;
}

function applyFirewallLoopback(port = DEFAULT_PORT_6008) {
  const osType = os.type();
  if (osType === 'Windows_NT') {
    // Attempt to run PowerShell command; may fail if not elevated
    const powershell = `New-NetFirewallRule -DisplayName \"Allow Godot LSP ${port} Loopback\" -Direction Inbound -Action Allow -Protocol TCP -LocalPort ${port} -LocalAddress 127.0.0.1`;
    const out = cp.spawnSync('powershell.exe', ['-NoProfile', '-Command', powershell], { encoding: 'utf8' });
    return out;
  }
  // Linux path: attempt to run sudo iptables
  const out = cp.spawnSync('sh', ['-c', `sudo iptables -A INPUT -i lo -p tcp --dport ${port} -j ACCEPT`], { encoding: 'utf8' });
  return out;
}

function readFirewallPolicy(repoRoot) {
  const pathFile = path.join(repoRoot, '.aln', 'firewall.policy.lock.json');
  try { return JSON.parse(fs.readFileSync(pathFile, 'utf8')); } catch (e) { return null; }
}

function writeFirewallPolicy(repoRoot, obj) {
  const pathFile = path.join(repoRoot, '.aln', 'firewall.policy.lock.json');
  fs.writeFileSync(pathFile, JSON.stringify(obj, null, 2), 'utf8');
  return pathFile;
}

function computePolicyHash(obj) {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(obj));
  return hash.digest('hex');
}

async function main(argv) {
  const repoRoot = process.cwd();
  const repoCfg = readRepoConfig(repoRoot);
  const repoPolicy = readFirewallPolicy(repoRoot);
  // parse common flags
  const forcePortIndex = argv.findIndex(a => a === '--force-port');
  const forcePort = (forcePortIndex !== -1 && argv[forcePortIndex + 1]) ? parseInt(argv[forcePortIndex + 1], 10) : undefined;
  const saveConfig = argv.includes('--save-config');
  const ciFail = argv.includes('--ci-fail');
  if (argv.includes('--diagnostics')) {
    const diag = await runDiagnostics(repoRoot);
    console.log(JSON.stringify(diag, null, 2));
    process.exit(0);
  }

  if (ciFail) {
    let expectedPort = forcePort || (repoCfg.cfg && repoCfg.cfg.defaultPort) || DEFAULT_PORT_6008;
    const issues = validateConfigs(repoRoot, expectedPort);
    if (issues.length > 0) {
      console.error('CI diagnostics failed: found configuration issues.');
      // Emit GitHub Actions annotations for each issue
      for (const i of issues) {
        const file = i.file || 'unknown';
        let message = `${i.problem}`;
        if (i.problem === 'port_mismatch') message = `Port mismatch: ${i.port} != expected ${expectedPort}`;
        if (i.problem === 'vscode_port_mismatch') message = `VSCode port mismatch: ${i.port} != expected ${expectedPort}`;
        console.log(`::error file=${file},line=1::${message}`);
      }
      console.error(JSON.stringify(issues, null, 2));
      process.exit(1);
    }
    console.log('CI diagnostics OK: validated configurations against expected port', expectedPort);
    process.exit(0);
  }

  if (argv.includes('--verify')) {
    const p = await scanPort(HOST, DEFAULT_PORT_6008);
    console.log(`port ${DEFAULT_PORT_6008} reachable? ${p}`);
    process.exit(p ? 0 : 1);
  }

  if (argv.includes('--allow-firewall-loopback')) {
    const portArgIndex = argv.findIndex(a => a === '--port' || a === '--force-port');
    const port = portArgIndex !== -1 && argv[portArgIndex + 1] ? parseInt(argv[portArgIndex + 1], 10) : (forcePort || (repoCfg.cfg && repoCfg.cfg.defaultPort) || DEFAULT_PORT_6008);
    const cmd = showFirewallCommands(port);
    if (!argv.includes('--confirm')) {
      console.log('Firewall command (no change made):');
      console.log(cmd);
      console.log('\nTo apply: run with --allow-firewall-loopback --confirm (requires elevation/privileges)');
      process.exit(0);
    }
    console.log('Attempting to apply firewall rule (require elevation/privileges)');
    // check policy lockfile (opt-in) before applying
    const policy = readFirewallPolicy(repoRoot);
    if (!policy || !policy.allow_firewall_apply) {
      console.error('Firewall policy does not permit apply. Create or enable .aln/firewall.policy.lock.json with allow_firewall_apply true.');
      process.exit(2);
    }
    if (policy.os && Array.isArray(policy.os) && policy.os.length > 0) {
      const cur = os.type();
      if (!policy.os.includes(cur) && !policy.os.includes('any')) {
        console.error(`Firewall policy does not permit this OS: ${cur}`);
        process.exit(3);
      }
    }
    // Prevent reapplying the same policy for the same port by checking lastAppliedHash
    const applyHash = computePolicyHash({ policy, port, os: os.type() });
    if (policy.lastAppliedHash && policy.lastAppliedHash === applyHash) {
      console.log('Firewall policy already applied for this configuration. Nothing to do.');
      process.exit(0);
    }
    const simulate = argv.includes('--simulate-apply');
    let out;
    if (simulate) {
      console.log('Simulate apply: not executing platform command');
      out = { status: 0, error: null, stdout: '', stderr: '' };
    } else {
      out = applyFirewallLoopback(port);
    }
    if (out.error) {
      console.error('Failed to apply firewall rule:', out.error.message);
      process.exit(1);
    }
    // On success, update policy with lastAppliedHash and write to disk
    try {
      const newPolicy = Object.assign({}, policy, { lastAppliedHash: applyHash });
      writeFirewallPolicy(repoRoot, newPolicy);
    } catch (e) {
      console.warn('Failed to persist firewall policy hash:', e.message);
    }
    console.log('stdout:', out.stdout);
    console.log('stderr:', out.stderr);
    process.exit(out.status === 0 ? 0 : 1);
  }

  if (argv.includes('--enable-language-server')) {
    const tresFiles = findFiles(repoRoot, /^editor_settings.*\.tres$/i);
    if (!tresFiles.length) { console.warn('No editor_settings-*.tres files found'); }
    for (const f of tresFiles) { try { applyEditorSettingsTRES(f); console.log('patched', f); } catch (e) { console.warn('failed to patch', f, e.message); }}
    process.exit(0);
  }

  if (argv.includes('--vscode')) {
    ensureVscodeSettings(repoRoot);
    ensureVscodeLaunch(repoRoot);
    console.log('.vscode updated');
    process.exit(0);
  }

  if (argv.includes('--neovim')) {
    createNeovimSnippet(repoRoot);
    console.log('neovim snippet created under nvim_gdscript_lsp_snippet');
    process.exit(0);
  }

  // Default --apply behavior
  if (argv.includes('--apply') || argv.length === 2) {
    console.log('Running apply: enable-language-server + vscode + neovim config');
    // 1) run diagnostics
    const diag = await runDiagnostics(repoRoot);
    // 2) if no language server setup found, attempt to toggle TRES
    const tresFiles = findFiles(repoRoot, /^editor_settings.*\.tres$/i);
    // determine which port is currently reachable and prefer that
    let chosenPort = (forcePort || (repoCfg.cfg && repoCfg.cfg.defaultPort) || undefined);
    if (!chosenPort) {
      const p6008 = await scanPort(HOST, DEFAULT_PORT_6008);
      const p6005 = await scanPort(HOST, DEFAULT_PORT_6005);
      chosenPort = p6008 ? DEFAULT_PORT_6008 : (p6005 ? DEFAULT_PORT_6005 : DEFAULT_PORT_6008);
    }

    if (saveConfig && chosenPort) {
      writeRepoConfig(repoRoot, { defaultPort: chosenPort });
      console.log('Saved godot_lsp.config.json with defaultPort', chosenPort);
    }

    for (const f of tresFiles) { try { applyEditorSettingsTRES(f, chosenPort); } catch (e) { console.warn(e.message); }}
    ensureVscodeSettings(repoRoot, HOST, chosenPort);
    ensureVscodeLaunch(repoRoot, 'godot', HOST, chosenPort);
    createNeovimSnippet(repoRoot);
    console.log('apply done');
    process.exit(0);
  }

  console.log('Usage: fix-godot-lsp.cjs [--diagnostics|--apply|--vscode|--neovim|--enable-language-server|--verify] [--force-port <port>] [--save-config] [--allow-firewall-loopback] [--confirm] [--ci-fail]');
}

if (require.main === module) main(process.argv);

// Expose functions for programmatic usage/testing
module.exports = {
  scanPort,
  findFiles,
  applyEditorSettingsTRES,
  ensureVscodeSettings,
  ensureVscodeLaunch,
  createNeovimSnippet,
  runDiagnostics,
  showFirewallCommands,
  applyFirewallLoopback,
  readRepoConfig,
  writeRepoConfig,
  validateConfigs,
  readFirewallPolicy,
  writeFirewallPolicy,
  computePolicyHash,
};
