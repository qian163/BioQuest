#!/usr/bin/env node
/**
 * ============================================================
 * scripts/verify-rls-policies.js — Supabase RLS 策略静态审计（P2-9）
 * ============================================================
 * 用途：在 CI 中防回归 —— 凡在 sql/*.sql 中 CREATE TABLE 的表，
 * 必须同时满足：
 *   1) 存在 `ALTER TABLE <t> ENABLE ROW LEVEL SECURITY`；
 *   2) 存在至少一条 `CREATE POLICY ... ON <t>`。
 * 任一缺失即视为"RLS 未覆盖"，进程以非零码退出，阻断合并。
 *
 * 例外：仅允许「种子/系统维护表」缺失 RLS，需显式列入 ALLOW_NO_RLS。
 * 注意：本脚本是静态审计，服务端还应按最小权限原则人工复核 policy 内容；
 *       生产库实时校验见 tools/python/check-rls-policies.py（需 SERVICE_ROLE_KEY）。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SQL_DIR = path.join(ROOT, 'sql');

// 允许例外（缺失 RLS 的系统表/纯本地表；务必注明原因）
const ALLOW_NO_RLS = new Set([]);

function normalizeName(n) {
  return String(n || '').trim().replace(/^public\./, '').replace(/^"|"$/g, '').toLowerCase();
}

function readSqlFiles() {
  if (!fs.existsSync(SQL_DIR)) return [];
  return fs.readdirSync(SQL_DIR)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => ({ file: f, text: fs.readFileSync(path.join(SQL_DIR, f), 'utf8') }));
}

function collect(sqls) {
  const tables = new Set();   // 所有被 CREATE TABLE 的表
  const rlsEnabled = new Set();
  const policies = new Set(); // 有策略的表

  for (const { file, text } of sqls) {
    // CREATE TABLE [IF NOT EXISTS] [schema.]name (
    const createRe = /create\s+table\s+(if\s+not\s+exists\s+)?([a-z0-9_."]+)\s*(\(|as|using|with)/gi;
    let m;
    while ((m = createRe.exec(text)) !== null) {
      tables.add(normalizeName(m[2]));
    }
    // ALTER TABLE name ENABLE ROW LEVEL SECURITY
    const rlsRe = /alter\s+table\s+(if\s+exists\s+)?([a-z0-9_."]+)\s+enable\s+row\s+level\s+security/gi;
    while ((m = rlsRe.exec(text)) !== null) {
      rlsEnabled.add(normalizeName(m[2]));
    }
    // CREATE POLICY name ON table（含带引号/空格的多词策略名）
    // 以及仓库惯例的辅助函数写法：SELECT bioquest_create_policy('<table>', ...)
    const polRe = /(?:create\s+policy\s+(?:"[^"]*"|[a-z0-9_]+)\s+on\s+|select\s+bioquest_create_policy\(\s*')([a-z0-9_."]+)/gi;
    while ((m = polRe.exec(text)) !== null) {
      policies.add(normalizeName(m[1]));
    }
  }
  return { tables, rlsEnabled, policies };
}

function main() {
  const files = readSqlFiles();
  if (files.length === 0) {
    console.error('[verify-rls] 未找到 sql/ 目录或任何 .sql 文件');
    process.exit(1);
  }
  const { tables, rlsEnabled, policies } = collect(files);

  let failed = 0;
  const sorted = Array.from(tables).sort();
  console.log(`[verify-rls] 共审计 ${sorted.length} 张表（${files.length} 个 SQL 文件）\n`);

  for (const t of sorted) {
    const hasRls = rlsEnabled.has(t);
    const hasPolicy = policies.has(t);
    const pass = (hasRls && hasPolicy) || ALLOW_NO_RLS.has(t);
    if (!pass) failed++;
    console.log(`  ${pass ? '[ok]' : '[FAIL]'} ${t}  RLS=${hasRls ? 'on' : 'off'}  策略=${hasPolicy ? 'yes' : 'no'}${ALLOW_NO_RLS.has(t) ? '  （白名单例外）' : ''}`);
  }

  if (failed > 0) {
    console.error(`\n[verify-rls] 失败：${failed} 张表缺失 RLS 策略保护。请为表补充 ENABLE ROW LEVEL SECURITY 与最小权限 CREATE POLICY，或将确为系统表的用例加入 ALLOW_NO_RLS（附原因）。`);
    process.exit(1);
  }
  console.log(`\n[verify-rls] 全部通过 ✓（${sorted.length} 张表均已启用 RLS 且至少含一条策略）`);
}

main();