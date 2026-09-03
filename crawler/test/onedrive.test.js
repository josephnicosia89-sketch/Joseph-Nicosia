import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { alternatePaths, isUncOrDrivePath, isAbsolutePath, resolveLocal, fetchSource } from '../onedrive.js';

test('recognises drive-letter and UNC paths', () => {
  assert.ok(isUncOrDrivePath('Q:\\Sales\\Sales Order Inwork Report.xlsm'));
  assert.ok(isUncOrDrivePath('\\\\EMPIRE-SERVER\\Sales\\report.xlsm'));
  assert.ok(!isUncOrDrivePath('Desktop/Sales Order Inwork Report.xlsm'));
  assert.ok(isAbsolutePath('Q:\\x.xlsm'));
  assert.ok(isAbsolutePath('\\\\server\\share\\x.xlsm'));
});

test('maps a drive letter to its UNC path', () => {
  const cfg = { driveMap: { 'Q:': '\\\\EMPIRE-SERVER\\Sales\\' } };
  const sep = process.platform === 'win32' ? '\\' : path.sep;
  assert.deepEqual(alternatePaths('Q:\\Reports\\Inwork.xlsm', cfg), ['\\\\EMPIRE-SERVER\\Sales' + sep + 'Reports' + sep + 'Inwork.xlsm']);
  assert.deepEqual(alternatePaths('q:\\Inwork.xlsm', cfg), ['\\\\EMPIRE-SERVER\\Sales' + sep + 'Inwork.xlsm']);
  assert.deepEqual(alternatePaths('Q:\\Inwork.xlsm', {}), []);
});

test('falls back to the mapped UNC location when the letter is not mounted', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unc-'));
  const file = path.join(dir, 'Inwork.xlsm');
  fs.writeFileSync(file, 'x');
  const cfg = { driveMap: { 'Q:': dir } };
  assert.equal(resolveLocal('Q:\\Inwork.xlsm', cfg), file);
  assert.equal(resolveLocal('Q:\\Missing.xlsm', cfg), '');
});

test('unreachable share gives an actionable error instead of trying Graph', async () => {
  await assert.rejects(fetchSource('Q:\\Nope\\Inwork.xlsm', { driveMap: { 'Q:': '\\\\no-such-server\\share' } }), /Cannot reach Q:\\Nope\\Inwork\.xlsm.*driveMap/s);
});
