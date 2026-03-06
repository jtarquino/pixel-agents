#!/usr/bin/env node
/**
 * Pixel Agents CLI
 *
 * Usage:
 *   pixel-agents            — Launch the standalone viewer
 *   pixel-agents status     — Show agent status in terminal
 *   pixel-agents install    — Install the Copilot CLI skill
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const command = process.argv[2] || 'view';

switch (command) {
  case 'view':
  case 'ver':
  case 'show':
    launchViewer();
    break;
  case 'status':
    showStatus();
    break;
  case 'install':
    installSkill();
    break;
  case 'help':
  case '--help':
  case '-h':
    printHelp();
    break;
  default:
    console.log(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}

function launchViewer() {
  console.log('🎮 Launching Pixel Agents viewer...\n');

  // Check if viewer is built
  const mainJs = path.join(ROOT, 'viewer', 'dist', 'main.js');
  if (!fs.existsSync(mainJs)) {
    console.log('Building viewer...');
    execSync('npm run build', { cwd: path.join(ROOT, 'viewer'), stdio: 'inherit' });
  }

  // Check if webview is built
  const webviewHtml = path.join(ROOT, 'dist', 'webview', 'index.html');
  if (!fs.existsSync(webviewHtml)) {
    console.log('Building webview...');
    execSync('npm run build:webview', { cwd: ROOT, stdio: 'inherit' });
  }

  // Find electron binary
  let electronBin;
  try {
    electronBin = require(path.join(ROOT, 'viewer', 'node_modules', 'electron'));
  } catch {
    console.error('❌ Electron not found. Run: cd viewer && npm install');
    process.exit(1);
  }

  // Launch Electron detached
  const child = spawn(electronBin, [mainJs], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  console.log(`✅ Viewer launched (PID: ${child.pid})`);
}

function showStatus() {
  const statusScript = path.join(ROOT, 'skill', 'scripts', 'get-status.js');
  if (!fs.existsSync(statusScript)) {
    console.error('❌ get-status.js not found');
    process.exit(1);
  }
  execSync(`node "${statusScript}" --all`, { stdio: 'inherit' });
}

function installSkill() {
  const installScript = path.join(ROOT, 'scripts', 'install-skill.js');
  if (!fs.existsSync(installScript)) {
    console.error('❌ install-skill.js not found');
    process.exit(1);
  }
  execSync(`node "${installScript}"`, { stdio: 'inherit' });
}

function printHelp() {
  console.log(`
🎮 Pixel Agents — Visualize AI coding agents as pixel art characters

Usage:
  pixel-agents [command]

Commands:
  view, show, ver   Launch the standalone Electron viewer (default)
  status            Show agent status in the terminal
  install           Install the Copilot CLI skill
  help              Show this help message

Examples:
  pixel-agents              Open the viewer window
  pixel-agents status       See all active agents
  pixel-agents install      Install skill for Copilot CLI
`);
}
