/**
 * ============================================================
 * BioQuest — 生物主题微交互彩蛋（P2-35）
 * ============================================================
 * 两个零干扰、respect prefers-reduced-motion 的微交互：
 *   1) 快速连点导航栏 Logo 5 次（3 秒内）→ 触发"叶瓣飞舞"彩蛋：
 *      屏幕内飘落数枚叶片（div + CSS 动画），1.5s 后自动清理；
 *   2) 主按钮/卡片轻触反馈：按下时轻微的 scale 下沉 + 涟漪，
 *      全部由注入的 @media (prefers-reduced-motion: no-preference) 控制，
 *      对无障碍用户完全关闭。
 * CSP 安全：无内联事件处理器；样式通过 <style> 节点注入
 *（style-src 'unsafe-inline' 已授权）。
 * ============================================================ */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var REDUCED = false;
  try {
    REDUCED = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {}

  var CLICK_WINDOW_MS = 3000;
  var LOGO_SELECTOR = '.logo, .site-logo, header .logo, nav .logo, .navbar-brand';
  var _logoClicks = [];

  function injectStyle() {
    var id = 'bq-micro-interactions-style';
    if (document.getElementById(id)) return;
    var style = document.createElement('style');
    style.id = id;
    style.textContent =
      '@media (prefers-reduced-motion: no-preference){' +
      /* 按钮轻触反馈 */
      '.btn:active,.button:active,[class*="btn"]:active{' +
      'transform:scale(0.97)!important;transition:transform .12s ease!important;}' +
      /* 卡片悬浮抬升 */
      '.bio-card:hover,[class*="-card"]:hover{' +
      'transform:translateY(-2px);transition:transform .25s cubic-bezier(.2,.7,.3,1.2);}' +
      /* 叶瓣飘落动画 */
      '@keyframes bqLeafFall{0%{transform:translateY(-10px) rotate(0deg);opacity:0;}' +
      '15%{opacity:.95;}100%{transform:translateY(calc(100vh + 40px)) rotate(540deg);opacity:.75;}}' +
      '.bq-leaf{position:fixed;top:-20px;z-index:9999;pointer-events:none;' +
      'font-size:18px;animation:bqLeafFall linear forwards;will-change:transform;}' +
      '}';
    document.head.appendChild(style);
  }

  var LEAF_GLYPHS = ['🍃', '🍂', '🌿', '🍀', '🌱'];

  function spawnLeafBurst() {
    if (REDUCED || document.hidden) return;
    for (var i = 0; i < 10; i++) {
      (function (i) {
        var el = document.createElement('div');
        el.className = 'bq-leaf';
        el.textContent = LEAF_GLYPHS[i % LEAF_GLYPHS.length];
        el.style.left = (5 + Math.random() * 90) + 'vw';
        el.style.animationDuration = (1.1 + Math.random() * 0.9) + 's';
        el.style.animationDelay = (Math.random() * 0.35) + 's';
        el.style.fontSize = (14 + Math.random() * 12) + 'px';
        document.body.appendChild(el);
        setTimeout(function () {
          if (el.parentNode) el.parentNode.removeChild(el);
        }, 2200);
      })(i);
    }
  }

  function handleLogoClick(e) {
    var now = Date.now();
    _logoClicks = _logoClicks.filter(function (t) { return now - t < CLICK_WINDOW_MS; });
    _logoClicks.push(now);
    if (_logoClicks.length >= 5) {
      _logoClicks = [];
      spawnLeafBurst();
    }
  }

  function init() {
    injectStyle();
    try {
      var logo = document.querySelector(LOGO_SELECTOR);
      if (!logo) {
        // Logo 选择器未命中时不重复绑定；交给 body 委托兜底（只认可点击 Logo 区域）
        document.addEventListener('click', function (e) {
          var t = e.target;
          while (t && t !== document.body) {
            if (t.matches && t.matches(LOGO_SELECTOR)) { handleLogoClick(); return; }
            t = t.parentNode;
          }
        }, true);
        return;
      }
      logo.addEventListener('click', handleLogoClick, true);
    } catch (e) { /* 静默 */ }

    // 兜底：DOMContentLoaded 后若 Logo 才渲染出来，补充绑定
    document.addEventListener('DOMContentLoaded', function () {
      try {
        var logo = document.querySelector(LOGO_SELECTOR);
        if (logo) logo.addEventListener('click', handleLogoClick, true);
      } catch (e) {}
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();