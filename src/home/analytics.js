/**
 * LimesAnalytics - Lightweight cookie-free web analytics
 * < 10KB, GDPR compliant, localStorage only
 */
(function() {
  'use strict';

  var ANALYTICS_KEY = 'lsn_analytics';
  var SESSION_DURATION = 30 * 60 * 1000; // 30 minutes

  var sessionId = null;
  var sessionStart = null;
  var analyticsData = null;

  /**
   * Generate a random session ID (8-char hex)
   */
  function generateSessionId() {
    var arr = new Uint8Array(4);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(function(b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }

  /**
   * Get or create session ID, rotating if expired
   */
  function getSessionId() {
    var now = Date.now();
    if (!sessionId || !sessionStart || (now - sessionStart > SESSION_DURATION)) {
      sessionId = generateSessionId();
      sessionStart = now;
    }
    return sessionId;
  }

  /**
   * Initialize analytics data structure
   */
  function initData() {
    if (analyticsData) return analyticsData;
    analyticsData = {
      s: getSessionId(),
      v: [], // views
      e: [], // events
      ts: sessionStart || Date.now()
    };
    return analyticsData;
  }

  /**
   * Save analytics data to localStorage with compression
   */
  function saveData() {
    if (!analyticsData) return;
    try {
      var json = JSON.stringify(analyticsData);
      var compressed = LZString.compressToBase64(json);
      localStorage.setItem(ANALYTICS_KEY, compressed);
    } catch (e) {
      // localStorage full or unavailable
    }
  }

  /**
   * Load analytics data from localStorage
   */
  function loadData() {
    try {
      var compressed = localStorage.getItem(ANALYTICS_KEY);
      if (compressed) {
        var decompressed = LZString.decompressFromBase64(compressed);
        if (decompressed) {
          analyticsData = JSON.parse(decompressed);
          return analyticsData;
        }
      }
    } catch (e) {
      localStorage.removeItem(ANALYTICS_KEY);
    }
    return null;
  }

  /**
   * Track a pageview
   */
  function trackPageview(page, referrer) {
    var data = loadData() || initData();
    // Rotate session if needed
    data.s = getSessionId();
    // Add pageview
    data.v.push({
      p: page || '/',
      t: Date.now(),
      r: referrer || document.referrer || null
    });
    // Keep only last 100 pageviews
    if (data.v.length > 100) {
      data.v = data.v.slice(-100);
    }
    analyticsData = data;
    saveData();
  }

  /**
   * Track an event
   */
  function trackEvent(name, label, value) {
    var data = loadData() || initData();
    // Rotate session if needed
    data.s = getSessionId();
    // Add event
    data.e.push({
      n: name,
      l: label || null,
      v: value || null,
      t: Date.now()
    });
    // Keep only last 200 events
    if (data.e.length > 200) {
      data.e = data.e.slice(-200);
    }
    analyticsData = data;
    saveData();
  }

  /**
   * Track scroll depth (throttled)
   */
  var maxScrollPercent = 0;
  function trackScrollDepth() {
    var scrollPercent = Math.round(
      (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100
    );
    if (scrollPercent > maxScrollPercent) {
      maxScrollPercent = scrollPercent;
      trackEvent('scroll', 'depth', maxScrollPercent);
    }
  }

  /**
   * Setup scroll tracking (throttled)
   */
  function setupScrollTracking() {
    var ticking = false;
    window.addEventListener('scroll', function() {
      if (!ticking) {
        requestAnimationFrame(function() {
          trackScrollDepth();
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  /**
   * Setup click tracking on elements with data-analytics attribute
   */
  function setupClickTracking() {
    document.addEventListener('click', function(e) {
      var target = e.target.closest('[data-analytics]');
      if (target) {
        var name = target.getAttribute('data-analytics');
        var label = target.getAttribute('data-analytics-label') || null;
        trackEvent('click', label || name);
      }
    });
  }

  /**
   * Setup auto-pageview tracking on history changes (SPA support)
   */
  function setupHistoryTracking() {
    if (history.pushState) {
      var originalPushState = history.pushState;
      history.pushState = function() {
        originalPushState.apply(this, arguments);
        trackPageview(location.pathname, document.referrer);
      };
      window.addEventListener('popstate', function() {
        trackPageview(location.pathname, document.referrer);
      });
    }
  }

  /**
   * Get analytics data (for admin/debug)
   */
  function getData() {
    return loadData() || initData();
  }

  /**
   * Clear analytics data
   */
  function clearData() {
    analyticsData = null;
    localStorage.removeItem(ANALYTICS_KEY);
  }

  /**
   * Get stats summary
   */
  function getStats() {
    var data = loadData() || initData();
    return {
      sessionId: data.s,
      sessionStart: data.ts,
      pageviews: data.v.length,
      events: data.e.length,
      uniquePages: data.v.reduce(function(acc, v) {
        acc[v.p] = (acc[v.p] || 0) + 1;
        return acc;
      }, {})
    };
  }

  // Expose public API
  window.LimesAnalytics = {
    trackPageview: trackPageview,
    trackEvent: trackEvent,
    getData: getData,
    getStats: getStats,
    clearData: clearData
  };

  // Auto-initialize on load
  function init() {
    // Track first pageview
    trackPageview(location.pathname, document.referrer);
    
    // Setup tracking
    setupClickTracking();
    setupScrollTracking();
    setupHistoryTracking();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();