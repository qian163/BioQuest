/**
 * BioQuest — 学习热力图集成模块（cal-heatmap）
 * 在指定容器渲染 GitHub 风格的学习记录日历
 * 依赖：js/vendor/cal-heatmap.min.js + cal-heatmap.css
 */
(function () {
  'use strict';

  var _instances = {};  // containerId -> { cal, destroy }
  var _depsLoading = null;

  function ensureLoaded() {
    return typeof window !== 'undefined' &&
      typeof window.CalHeatmap !== 'undefined';
  }

  /**
   * P2-4：cal-heatmap 与其依赖 d3 不再首屏加载，首次挂载热力图时按需注入
   * （cal-heatmap 4.x 依赖 d3-selection/color/fetch，必须先于 cal-heatmap 加载）
   * @returns {Promise<boolean>}
   */
  function loadDeps() {
    if (ensureLoaded()) return Promise.resolve(true);
    if (typeof window.loadScriptOnce !== 'function') return Promise.resolve(false);
    if (!_depsLoading) {
      _depsLoading = window.loadScriptOnce('js/vendor/d3.min.js?v=20260723d', {
        verify: function () { return typeof window.d3 !== 'undefined'; }
      }).then(function () {
        return window.loadScriptOnce('js/vendor/cal-heatmap.min.js?v=20260723d', {
          verify: function () { return typeof window.CalHeatmap !== 'undefined'; }
        });
      }).then(function () { return true; }).catch(function () { _depsLoading = null; return false; });
    }
    return _depsLoading;
  }

  /**
   * 挂载热力图
   * @param {string} containerId
   * @param {object} data { 'YYYY-MM-DD': count, ... }
   * @param {object} opts { range, theme, color }
   * @returns {object|null} 句柄
   */
  function mount(containerId, data, opts) {
    var container = document.getElementById(containerId);
    if (!container) {
      console.warn('[StudyHeatmap] 容器不存在:', containerId);
      return null;
    }
    if (!ensureLoaded()) {
      // cal-heatmap 未就绪：先按需加载依赖（d3 → cal-heatmap），完成后重试挂载
      container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:24px;">正在加载热力图组件…</p>';
      loadDeps().then(function (ok) {
        if (!ok) {
          var el = document.getElementById(containerId);
          if (el) el.innerHTML = '<p style="color:var(--color-error);text-align:center;padding:24px;">热力图组件加载失败，请检查网络</p>';
          return;
        }
        mount(containerId, data, opts);
      });
      return null;
    }

    // 销毁旧实例
    unmount(containerId);

    opts = opts || {};
    var range = opts.range || 12;  // 默认 12 个月
    var theme = opts.theme || 'light';
    var baseColor = opts.color || '#4a7c59';

    // 转换为 cal-heatmap 4.x 数据格式：[{date: <ms 时间戳>, value: <数值>}, ...]
    // 注意：4.x 的 getDatas 仅接受 URL 字符串或数组，普通对象会被静默丢弃；
    //       数组元素中 date 字段需为毫秒时间戳（内部经 dayjs(ms) 解析）
    var dataSource = [];
    if (data && typeof data === 'object') {
      Object.keys(data).forEach(function (date) {
        // Date.parse 返回毫秒时间戳
        var ts = Date.parse(date);
        if (!isNaN(ts)) {
          dataSource.push({ date: ts, value: data[date] });
        }
      });
    }

    try {
      var CalHeatmap = window.CalHeatmap;
      var cal = new CalHeatmap();
      // 颜色梯度（5 级）
      var colorScale = [
        '#ebedf0',
        lightenColor(baseColor, 60),
        lightenColor(baseColor, 30),
        baseColor,
        darkenColor(baseColor, 20)
      ];

      // cal-heatmap 4.x：CalendarLabel 已移除（3.x API），如需日历标签需单独引入
      // cal-heatmap-plugin-calendar-label 插件，此处不再引用。
      var painter = {
        cal: cal,
        destroy: function () {
          try { cal.destroy(); } catch (e) {}
        }
      };

      // 4.x: cal.paint({ range, domain, subDomain, data, ... })
      cal.paint({
        itemSelector: '#' + containerId,
        domain: { type: 'month', gutter: 4, label: { text: 'MM月' } },
        subDomain: { type: 'ghDay', radius: 2, width: 11, height: 11, gutter: 4 },
        range: range,
        date: { start: new Date(Date.now() - (range - 1) * 30 * 24 * 3600 * 1000) },
        data: {
          source: dataSource,
          type: 'json',
          x: 'date',
          y: function (d) { return d.value; }
        },
        scale: {
          color: {
            type: 'threshold',
            range: colorScale,
            domain: [1, 3, 5, 10]
          }
        },
        theme: theme === 'dark' ? 'dark' : 'light'
      });

      _instances[containerId] = painter;
      return painter;
    } catch (e) {
      console.error('[StudyHeatmap] 挂载失败:', e);
      container.innerHTML = '<p style="color:var(--color-error);text-align:center;padding:24px;">热力图加载失败</p>';
      return null;
    }
  }

  /**
   * 更新数据
   */
  function update(containerId, data) {
    var inst = _instances[containerId];
    if (!inst) return mount(containerId, data);
    // 简单实现：重新挂载
    return mount(containerId, data);
  }

  function unmount(containerId) {
    var inst = _instances[containerId];
    if (inst) {
      try { inst.destroy(); } catch (e) {}
      delete _instances[containerId];
    }
    var container = document.getElementById(containerId);
    if (container) container.innerHTML = '';
  }

  function unmountAll() {
    Object.keys(_instances).forEach(unmount);
  }

  // 简易颜色工具
  function lightenColor(hex, percent) {
    var num = parseInt(hex.replace('#', ''), 16);
    var r = Math.min(255, (num >> 16) + Math.round(255 * percent / 100));
    var g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * percent / 100));
    var b = Math.min(255, (num & 0xff) + Math.round(255 * percent / 100));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  function darkenColor(hex, percent) {
    var num = parseInt(hex.replace('#', ''), 16);
    var r = Math.max(0, (num >> 16) - Math.round(255 * percent / 100));
    var g = Math.max(0, ((num >> 8) & 0xff) - Math.round(255 * percent / 100));
    var b = Math.max(0, (num & 0xff) - Math.round(255 * percent / 100));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /**
   * 学习热力图模块对外接口，基于 cal-heatmap 渲染 GitHub 风格的学习记录日历，并提供挂载、更新与销毁能力。
   * @type {Object}
   */
  window.StudyHeatmap = {
    mount: mount,
    update: update,
    unmount: unmount,
    unmountAll: unmountAll,
    isAvailable: ensureLoaded
  };
})();
