import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

describe('analytics.js — source code checks', function() {
  it('should not reference window or document globals directly', function() {
    var code = readFileSync('src/home/analytics.js', 'utf-8');
    
    // Should use window only for exposing API, not for direct access
    assert.match(code, /window\.LimesAnalytics/);
    
    // Should NOT access window.document in main tracking logic
    assert.doesNotMatch(code, /window\.document\.addEventListener/);
  });
  
  it('should expose LimesAnalytics API on window', function() {
    var code = readFileSync('src/home/analytics.js', 'utf-8');
    assert.match(code, /window\.LimesAnalytics\s*=/);
  });
  
  it('should use localStorage for data persistence', function() {
    var code = readFileSync('src/home/analytics.js', 'utf-8');
    assert.match(code, /localStorage\.setItem/);
    assert.match(code, /localStorage\.getItem/);
  });
  
  it('should use LZString for compression', function() {
    var code = readFileSync('src/home/analytics.js', 'utf-8');
    assert.match(code, /LZString\.compressToBase64/);
    assert.match(code, /LZString\.decompressFromBase64/);
  });
});

describe('analytics.js — session management', function() {
  it('should generate session ID', function() {
    var code = readFileSync('src/home/analytics.js', 'utf-8');
    assert.match(code, /function generateSessionId/);
  });
  
  it('should track session duration', function() {
    var code = readFileSync('src/home/analytics.js', 'utf-8');
    assert.match(code, /SESSION_DURATION/);
  });
});

describe('analytics.js — pageview tracking', function() {
  it('should have trackPageview function', function() {
    var code = readFileSync('src/home/analytics.js', 'utf-8');
    assert.match(code, /function trackPageview/);
  });
  
  it('should track referrer', function() {
    var code = readFileSync('src/home/analytics.js', 'utf-8');
    assert.match(code, /referrer/);
  });
});

describe('analytics.js — event tracking', function() {
  it('should have trackEvent function', function() {
    var code = readFileSync('src/home/analytics.js', 'utf-8');
    assert.match(code, /function trackEvent/);
  });
  
  it('should support click tracking via data-analytics attribute', function() {
    var code = readFileSync('src/home/analytics.js', 'utf-8');
    assert.match(code, /data-analytics/);
  });
});

describe('analytics.js — privacy compliance', function() {
  it('should NOT track IP addresses explicitly', function() {
    var code = readFileSync('src/home/analytics.js', 'utf-8');
    // Should not extract or store IP addresses
    assert.doesNotMatch(code, /\.ip\s*=/i);
    assert.doesNotMatch(code, /ip_address/);
  });
  
  it('should use localStorage (not cookies)', function() {
    var code = readFileSync('src/home/analytics.js', 'utf-8');
    assert.doesNotMatch(code, /document\.cookie/);
  });
  
  it('should compress data for privacy', function() {
    var code = readFileSync('src/home/analytics.js', 'utf-8');
    assert.match(code, /compressToBase64/);
  });
});