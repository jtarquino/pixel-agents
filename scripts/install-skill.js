#!/usr/bin/env node
/**
 * Pixel Agents — Skill Installer
 * Copies the pixel-agents skill to ~/.copilot/skills/pixel-agents/
 *
 * Usage: node scripts/install-skill.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SKILL_SOURCE = path.join(__dirname, '..', 'skill');
const SKILL_TARGET = path.join(os.homedir(), '.copilot', 'skills', 'pixel-agents');

function copyDirRecursive(src, dest) {
	fs.mkdirSync(dest, { recursive: true });
	const entries = fs.readdirSync(src, { withFileTypes: true });
	for (const entry of entries) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);
		if (entry.isDirectory()) {
			copyDirRecursive(srcPath, destPath);
		} else {
			fs.copyFileSync(srcPath, destPath);
			console.log(`  📄 ${path.relative(SKILL_SOURCE, srcPath)}`);
		}
	}
}

console.log('🎮 Pixel Agents — Installing Skill\n');
console.log(`Source: ${SKILL_SOURCE}`);
console.log(`Target: ${SKILL_TARGET}\n`);

if (!fs.existsSync(SKILL_SOURCE)) {
	console.error('❌ Skill source not found. Run from the pixel-agents repo root.');
	process.exit(1);
}

// Ensure ~/.copilot/skills/ exists
const skillsDir = path.join(os.homedir(), '.copilot', 'skills');
fs.mkdirSync(skillsDir, { recursive: true });

// Copy skill
console.log('📋 Copying files:');
copyDirRecursive(SKILL_SOURCE, SKILL_TARGET);

// Make shell scripts executable on Unix
if (process.platform !== 'win32') {
	const scriptsDir = path.join(SKILL_TARGET, 'scripts');
	if (fs.existsSync(scriptsDir)) {
		for (const f of fs.readdirSync(scriptsDir)) {
			if (f.endsWith('.sh')) {
				fs.chmodSync(path.join(scriptsDir, f), 0o755);
			}
		}
	}
}

console.log('\n✅ Skill installed successfully!');
console.log(`\nVerify with: ls ${SKILL_TARGET}`);
console.log('In Copilot CLI, try: "show me my agents" or "ver agentes"');
