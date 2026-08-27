#!/usr/bin/env node
/**
 * ============================================================
 * scripts/compress-assets.js — 发布资源压缩（P2-1）
 * ============================================================
 * GitHub Pages / 静态托管不会动态开启 gzip/brotli（自定义域名尤其如此），
 * 本脚本产出两类价值：
 *
 * 1) 默认模式（无参数）：扫描 js/ css/ data/ 等发布资源，用 gzip / brotli
 *    实际压缩并输出报告（大小 + 压缩率），供人工核对"发布体积"。
 *    ！！！注意：GitHub Pages 等静态托管不会自动带上 Content-Encoding，
 *    .gz/.br 旁文件仅对自建 nginx 等支持预压缩服务的部署有效。
 *
 * 2) --write <dir>：把压缩后的镜像写入 <dir>（目录结构同源，文件名 .gz/.br），
 *    供支持预压缩的 Web 服务器（nginx gzip_static / brotli_static）直接部署使用。
 *
 * 3) --check：CI 预算门禁——js+css 总体 gzip 后体积必须不超过 GZ_BUDGET_BYTES，
 *    防止引入大体积库导致发布体积失控（与 P2-4 懒加载配合）。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = process.cwd();
// js/css/data（题库 data 只统计不打包压缩镜像的话太占仓库，这里仅报告/预算 js+css）
const SCAN_DIRS = ['js', 'css'];
const EXT_RE = /\.(js|css|json|svg|wasm)$/i;
const GZ_BUDGET_BYTES = 6 * 1024 * 1024; // js+css gzip 后 ≤ 6MB（当前 ~5.6MB，留余量防失控）

function human(n) {
  return n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(2) + ' MB'
    : n >= 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B';
}

function collectFiles() {
  const out = [];
  for (const dir of SCAN_DIRS) {
    const base = path.join(ROOT, dir);
    if (!fs.existsSync(base)) continue;
    const walk = (p) => {
      for (const ent of fs.readdirSync(p, { withFileTypes: true })) {
        const full = path.join(p, ent.name);
        if (ent.isDirectory()) walk(full);
        else if (EXT_RE.test(ent.name)) out.push(full);
      }
    };
    walk(base);
  }
  return out;
}

function gzSize(buf) {
  try { return zlib.gzipSync(buf, { level: 9 }).length; } catch (e) { return buf.length; }
}
function brSize(buf) {
  try { return zlib.brotliCompressSync(buf, { quality: 6 }).length; } catch (e) { return buf.length; }
}

function main() {
  const args = process.argv.slice(2);
  const writeIdx = args.indexOf('--write');
  const outDir = writeIdx >= 0 ? args[writeIdx + 1] : null;
  const doCheck = args.indexOf('--check') >= 0;

  const files = collectFiles();
  if (files.length === 0) {
    console.error('[compress] 未找到可压缩资源');
    process.exit(1);
  }

  let totalRaw = 0, totalGz = 0, totalBr = 0;
  const rows = [];

  for (const full of files) {
    const rel = path.relative(ROOT, full);
    const buf = fs.readFileSync(full);
    const raw = buf.length;
    const gz = gzSize(buf);
    const br = brSize(buf);
    totalRaw += raw; totalGz += gz; totalBr += br;
    rows.push({ rel, raw, gz, br });
    if (outDir) {
      const dest = path.join(outDir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest + '.gz', zlib.gzipSync(buf, { level: 9 }));
      if (zlib.brotliCompressSync) {
        fs.writeFileSync(dest + '.br', zlib.brotliCompressSync(buf, { quality: 6 }));
      }
    }
  }

  rows.sort((a, b) => b.raw - a.raw);
  console.log(`[compress] 共 ${rows.length} 个发布资源（js/css），gzip 预算门禁 ${human(GZ_BUDGET_BYTES)}`);
  console.log('  文件                                   原始      gzip      brotli    gz压缩率');
  for (const r of rows.slice(0, 25)) {
    const pct = r.raw ? Math.round((1 - r.gz / r.raw) * 100) : 0;
    console.log(
      '  ' + r.rel.padEnd(38).slice(0, 38) +
      human(r.raw).padStart(9) + human(r.gz).padStart(9) +
      human(r.br).padStart(9) + ('-' + pct + '%').padStart(9)
    );
  }
  if (rows.length > 25) console.log(`  …（其余 ${rows.length - 25} 个略）`);

  console.log('\n  合计: 原始 ' + human(totalRaw) + '  |  gzip ' + human(totalGz) + '  |  brotli ' + human(totalBr));
  if (outDir) console.log(`  [--write] 预压缩镜像已输出到 ${outDir}（.gz/.br 旁文件，供 gzip_static/brotli_static 部署）`);

  if (doCheck) {
    if (totalGz > GZ_BUDGET_BYTES) {
      console.error(`[compress] FAIL：js+css gzip 后 ${human(totalGz)} 超过预算 ${human(GZ_BUDGET_BYTES)}。` +
        '请将重型库改为按需加载（P2-4）或移除无用库后再提交。');
      process.exit(1);
    }
    console.log(`[compress] 预算门禁通过 ✓（gzip ${human(totalGz)} ≤ ${human(GZ_BUDGET_BYTES)}）`);
  }
}

main();