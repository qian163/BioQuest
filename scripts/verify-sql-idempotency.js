#!/usr/bin/env node
/**
 * ============================================================
 * scripts/verify-sql-idempotency.js — SQL migration 幂等性静态审计（P2-38）
 * ============================================================
 * 目的：所有 sql/*.sql 迁移文件都应可重复执行（幂等），防止部署脚本
 * 重跑时因对象已存在而中断。本脚本在 CI 中检查以下"必错"模式：
 *   1) `CREATE POLICY IF NOT EXISTS` —— PG15 不支持该语法（会直接语法错误）；
 *      应改用 DO 块按 pg_policies 判重（见 migration_v6 / storage_policies.sql）。
 *   2) `CREATE VIEW`（无 OR REPLACE）——同一文件必须存在同名 `DROP VIEW IF EXISTS`
 *      或使用 `CREATE OR REPLACE VIEW`。
 *   3) `CREATE TRIGGER` —— 同一文件中该触发器的 `DROP TRIGGER IF EXISTS` 必须
 *      出现在创建语句之前（PG 不支持 CREATE TRIGGER IF NOT EXISTS）。
 * 任一命中即非零退出，阻断合并。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SQL_DIR = path.join(ROOT, 'sql');

function readSqlFiles() {
  if (!fs.existsSync(SQL_DIR)) return [];
  return fs.readdirSync(SQL_DIR)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => ({ file: f, text: fs.readFileSync(path.join(SQL_DIR, f), 'utf8') }));
}

function main() {
  const files = readSqlFiles();
  if (files.length === 0) {
    console.error('[verify-sql-idem] 未找到 sql/ 目录或任何 .sql 文件');
    process.exit(1);
  }
  let failed = 0;

  for (const { file, text: rawText } of files) {
    const problems = [];
    // 先剥掉 -- 行内注释，避免把注释里的说明文字误判为 SQL 语句
    // （本仓库 SQL 的字符串字面量中不含 '--'，安全）
    const text = rawText.replace(/--[^\n]*/g, '');

    // 1) PG15 不支持的 CREATE POLICY IF NOT EXISTS
    let m = null;
    const badPolRe = /create\s+policy\s+if\s+not\s+exists/gi;
    while ((m = badPolRe.exec(text)) !== null) {
      problems.push(`L${lineOf(text, m.index)}: PG15 不支持 CREATE POLICY IF NOT EXISTS，请改用 DO 块 + pg_policies 判重`);
    }

    // 2) CREATE VIEW：必须 OR REPLACE 或同文件有 DROP VIEW IF EXISTS（同名）
    const viewRe = /create(?:\s+or\s+replace)?\s+view\s+(if\s+not\s+exists\s+)?([a-z0-9_.]+)/gi;
    while ((m = viewRe.exec(text)) !== null) {
      const name = m[2].toLowerCase();
      if (m[1]) continue; // IF NOT EXISTS 视图也合法
      const isOrReplace = /create\s+or\s+replace\s+view/gi.test(text);
      const dropRe = new RegExp(`drop\\s+view\\s+if\\s+exists\\s+${escapeRe(name)}`, 'i');
      if (!isOrReplace && !dropRe.test(text)) {
        problems.push(`L${lineOf(text, m.index)}: CREATE VIEW ${name} 无 OR REPLACE 且同文件无 DROP VIEW IF EXISTS`);
      }
    }

    // 3) CREATE TRIGGER：同文件前面必须有对应的 DROP TRIGGER IF EXISTS
    const trigRe = /create\s+trigger\s+([a-z0-9_]+)\s+on\s+([a-z0-9_.]+)/gi;
    while ((m = trigRe.exec(text)) !== null) {
      const tName = m[1].toLowerCase();
      const tTable = m[2].toLowerCase();
      const dropRe = new RegExp(`drop\\s+trigger\\s+if\\s+exists\\s+${escapeRe(tName)}\\s+on\\s+${escapeRe(tTable)}`, 'i');
      const dropM = dropRe.exec(text);
      if (!dropM || dropM.index > m.index) {
        problems.push(`L${lineOf(text, m.index)}: CREATE TRIGGER ${tName} 前缺少 DROP TRIGGER IF EXISTS ${tName} ON ${tTable}`);
      }
    }

    if (problems.length) {
      failed += problems.length;
      console.log(`[FAIL] ${file}`);
      for (const p of problems) console.log('  ' + p);
    } else {
      console.log(`[ok]   ${file}`);
    }
  }

  console.log(`\n[verify-sql-idem] 共审计 ${files.length} 个 SQL 文件${failed ? `，发现 ${failed} 处非幂等语句` : '，全部幂等 ✓'}`);
  if (failed > 0) process.exit(1);
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

main();