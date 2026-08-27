/**
 * ============================================================
 * BioQuest — 前端运行时配置（P2-10）
 * 把散落在各模块源码中的非密钥业务配置集中到本文件，便于统一管理与环境注入。
 * - 业务代码一律从 window.BIOQUEST_CONFIG 读取，不再硬编码在 JS 源码中；
 * - 服务器/CDN 可在本文件执行前注入 window.__BIOQUEST_CONFIG__ 覆盖默认值
 *   （如 server.py 从 .env 读取后注入；优先级别高于本文件默认值）。
 * ============================================================ */
(function () {
  'use strict';

  var DEFAULTS = {
    // 秘塔（Metaso）知识库 subject_id —— 原硬编码在 ai-client.js（P2-10 迁移至此）
    metasoSubjectId: '2045811707737636864',
    // Supabase 项目端点 —— anon key 是公开的（安全由 RLS 保证，见 P2-9 审计），
    // 但 URL/key 此前散落硬编码在 supabase-client.js / daily-billion.js / wiki.js 三处，
    // 统一在此声明，避免改一处漏两处（P2-10 迁移至此）
    supabaseUrl: 'https://qxehkfucvmxuojjkdaqy.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ZWhrZnVjdm14dW9qamtkYXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MjU2ODUsImV4cCI6MjEwMjIwMTY4NX0.lbiJxhFvy0t_J4qSeoP6K0r53M4KaEDSKkRlZu03ze8',
    // 后续新增的非密钥配置统一在此声明（密钥类配置严禁进前端，走服务端）
  };

  var cfg = {};
  var k;
  for (k in DEFAULTS) {
    if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) cfg[k] = DEFAULTS[k];
  }

  var overrides = (typeof window !== 'undefined' && window.__BIOQUEST_CONFIG__) || {};
  for (k in overrides) {
    if (Object.prototype.hasOwnProperty.call(overrides, k)) cfg[k] = overrides[k];
  }

  if (typeof window !== 'undefined') window.BIOQUEST_CONFIG = cfg;
})();