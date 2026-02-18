(function () {
  'use strict';

  function isObject(v) {
    return v != null && typeof v === 'object';
  }

  function resolveContainer(container) {
    if (!container) return null;
    if (typeof container === 'string') return document.querySelector(container);
    if (container && container.nodeType === 1) return container;
    return null;
  }

  function getScriptBaseUrl() {
    try {
      var el = document.currentScript;
      if (el && el.src) return new URL(el.src).origin;
    } catch (_) {}
    return window.location.origin;
  }

  function buildEmbedSrc(baseUrl, cfg) {
    var url = new URL('/embed/route', baseUrl);
    if (cfg.config) url.searchParams.set('config', String(cfg.config));
    return url.toString();
  }

  function init(config) {
    var cfg = isObject(config) ? config : {};
    var container = resolveContainer(cfg.container);
    if (!container) {
      throw new Error('MapQuestRoute.init: container not found. Pass a selector or DOM element via { container }.');
    }
    if (!cfg.config) {
      throw new Error('MapQuestRoute.init: missing config (base64url JSON).');
    }

    var baseUrl = cfg.baseUrl || getScriptBaseUrl();
    var src = buildEmbedSrc(baseUrl, cfg);

    var iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.title = cfg.title ? String(cfg.title) : 'MapQuest Custom Route';
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    iframe.style.border = '0';
    iframe.style.display = 'block';
    iframe.style.width = (cfg.width != null ? String(cfg.width) + 'px' : '100%');
    iframe.style.height = (cfg.height != null ? String(cfg.height) + 'px' : '640px');
    iframe.style.background = 'transparent';

    while (container.firstChild) container.removeChild(container.firstChild);
    container.appendChild(iframe);

    var autoResize = cfg.autoResize !== false;
    var onMessage = null;
    if (autoResize) {
      onMessage = function (event) {
        try {
          if (!event || event.source !== iframe.contentWindow) return;
          var data = event.data;
          if (!data || data.type !== 'mq-route-widget:resize') return;
          var h = Number(data.height);
          if (!Number.isFinite(h) || h <= 0) return;
          iframe.style.height = Math.ceil(h) + 'px';
        } catch (_) {}
      };
      window.addEventListener('message', onMessage);
    }

    return {
      iframe: iframe,
      destroy: function () {
        try {
          if (onMessage) window.removeEventListener('message', onMessage);
          if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
        } catch (_) {}
      },
      update: function (nextConfig) {
        var next = isObject(nextConfig) ? nextConfig : {};
        var merged = {};
        for (var k in cfg) merged[k] = cfg[k];
        for (var k2 in next) merged[k2] = next[k2];
        cfg = merged;
        iframe.src = buildEmbedSrc(baseUrl, cfg);
        if (cfg.width != null) iframe.style.width = String(cfg.width) + 'px';
        if (cfg.height != null) iframe.style.height = String(cfg.height) + 'px';
      },
    };
  }

  window.MapQuestRoute = { init: init };
})();

