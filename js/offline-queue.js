/**
 * ============================================================
 * BioQuest — 离线写操作队列（P2-16）
 * ============================================================
 * 问题：离线（或网络抖动）时对 Supabase 的写操作直接失败，
 * 数据只留在 localStorage/内存，网络恢复后不一致甚至丢失。
 *
 * 方案：轻量级持久化 FIFO 队列——
 *   - enqueue(type, args)：网络失败时把写操作入队（localStorage 持久化，上限 100 条）；
 *   - 恢复 online 后自动按序重放，成功出队、失败保留待下次；
 *   - 与 offline-indicator（app.js 的在线/离线提示）联动，入队时 toast 提示
 *     "已离线保存，联网后自动同步"。
 *
 * 使用约定：业务模块（如 supabase-client.js）捕获到网络类错误时调用
 *   BioQuest.offlineQueue.enqueue('syncPracticeRecordToSupabase', [record]);
 * 回放工厂按 type 调用对应的 window.* 函数（运行时必然已加载，懒解析）。
 * 仅对幂等性可接受的操作入队（打卡/练习记录 upsert/insert 可重放）；
 * 发帖等可能重复的操作由业务模块自行判断（仅网络错误时入队）。
 * ============================================================ */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.BioQuest && BioQuest.offlineQueue) return;

  var KEY = 'bioquest_offline_queue';
  var MAX_QUEUE = 100;
  var MAX_AGE_MS = 7 * 24 * 3600 * 1000; // 7 天内未同步成功的操作保留，过期丢弃
  var _flushing = false;

  var queue = [];

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function persist() {
    try {
      // 队列满时丢弃最旧（FIFO），保证不无限膨胀
      if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
      localStorage.setItem(KEY, JSON.stringify(queue));
    } catch (e) { /* 配额满等：静默 */ }
  }

  queue = load();

  function _isNetworkError(errMsg) {
    if (!errMsg) return false;
    var m = String(errMsg).toLowerCase();
    return m.indexOf('failed to fetch') >= 0 ||
      m.indexOf('fetch failed') >= 0 ||
      m.indexOf('networkerror') >= 0 ||
      m.indexOf('network error') >= 0 ||
      m.indexOf('load failed') >= 0 ||
      /offline|net::err/i.test(m);
  }

  /**
   * 判断某次写失败是否适合入队（网络类错误才入队，业务错误直接放行）
   */
  function shouldQueue(errMsg) {
    return _isNetworkError(errMsg) || !navigator.onLine;
  }

  function enqueue(type, args, errMsg) {
    if (!type || typeof window === 'undefined') return false;
    // 非网络错误不入队，避免把业务错误无限重试
    if (errMsg && !shouldQueue(errMsg)) return false;
    // 同类型+同参去重（打卡等高频操作防重复入队）
    for (var i = 0; i < queue.length; i++) {
      var q = queue[i];
      if (q.type === type && JSON.stringify(q.args) === JSON.stringify(args)) return false;
    }
    queue.push({ id: Date.now() + '_' + Math.random().toString(36).slice(2, 6), type: type, args: args, ts: Date.now() });
    persist();
    if (typeof window.showToast === 'function') {
      try { window.showToast('网络不可用，操作已保存，联网后自动同步', 'info'); } catch (e) {}
    }
    return true;
  }

  function pending() {
    // 清理过期条目
    var now = Date.now();
    var had = queue.length;
    queue = queue.filter(function (q) { return now - (q.ts || 0) < MAX_AGE_MS; });
    if (queue.length !== had) persist();
    return queue.length;
  }

  function replayOne(item) {
    var fn = item.type && typeof window[item.type] === 'function' ? window[item.type] : null;
    if (!fn) return Promise.resolve({ ok: false, error: '缺少回放函数: ' + item.type });
    var args = Array.isArray(item.args) ? item.args : [];
    return Promise.resolve()
      .then(function () { return fn.apply(null, args); })
      .then(function (r) {
        // 回放失败（仍离线/服务端报错）保留在队列
        if (r && r.ok === false && r.error) return { ok: false, error: r.error };
        return { ok: true };
      })
      .catch(function (e) {
        return { ok: false, error: e && e.message };
      });
  }

  /**
   * 按序重放整队。串行执行避免并发写冲突。
   * @returns {Promise<number>} 本次成功条数
   */
  function flush() {
    if (_flushing) return Promise.resolve(0);
    _flushing = true;
    var done = 0;
    var cursor = 0;
    // 串行逐个重放，成功出队
    function step() {
      if (cursor >= queue.length) {
        _flushing = false;
        persist();
        return Promise.resolve(done);
      }
      var item = queue[cursor];
      return replayOne(item).then(function (r) {
        cursor++;
        if (r && r.ok) {
          queue.splice(cursor - 1, 1);
          cursor--;
          done++;
        }
        return step();
      });
    }
    return step();
  }

  function size() { return queue.length; }

  // 网络恢复自动重放；页面可见时再 flush，安静后台不打扰
  window.addEventListener('online', function () {
    setTimeout(function () {
      if (document.hidden) return;
      flush();
    }, 800);
  });
  // 页面由隐藏恢复可见时兜底重放一次
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && navigator.onLine && queue.length > 0) {
      flush();
    }
  });

  if (!BioQuest) window.BioQuest = {};
  BioQuest.offlineQueue = {
    enqueue: enqueue,
    flush: flush,
    pending: pending,
    size: size,
    shouldQueue: shouldQueue
  };
})();