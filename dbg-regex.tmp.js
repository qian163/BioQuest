'use strict';
const s = 'CREATE POLICY "class_memberships_select" ON class_memberships';
const tests = {
  t3: /(?:create\s+policy\s+"[^"]*"\s+on)([a-z0-9_]+)/gi,
};
for (const [k, re] of Object.entries(tests)) {
  console.log(k, 'source=', JSON.stringify(re.source));
  console.log('  codePoints=', Array.from(re.source, (c) => c.codePointAt(0).toString(16)).join(','));
  re.lastIndex = 0;
  console.log(k, '=>', re.exec(s) ? 'MATCH' : 'NO');
}
// 对照组：不换行直接写
const t3b = /(?:create\s+policy\s+"[^"]*"\s+on)([a-z0-9_]+)/gi;
console.log('t3b =>', t3b.exec(s) ? 'MATCH' : 'NO');
const t3c = '(?:create\\s+policy\\s+"[^"]*"\\s+on)([a-z0-9_]+)';
console.log('t3c regexp =>', (new RegExp(t3c, 'gi')).exec(s) ? 'MATCH' : 'NO');