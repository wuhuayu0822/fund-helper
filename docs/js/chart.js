/* 简单净值走势折线图（原生 Canvas 2D，无第三方依赖） */
(function (global) {
  'use strict';

  function drawNavChart(canvas, navList, ma20Arr) {
    var cssWidth = canvas.clientWidth || canvas.parentNode.clientWidth;
    var cssHeight = 220;
    var dpr = global.devicePixelRatio || 1;

    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    canvas.style.height = cssHeight + 'px';

    var ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    var padding = { left: 56, right: 12, top: 20, bottom: 20 };
    var plotW = cssWidth - padding.left - padding.right;
    var plotH = cssHeight - padding.top - padding.bottom;

    var allVals = navList.concat(ma20Arr.filter(function (v) { return v !== null; }));
    var max = Math.max.apply(null, allVals);
    var min = Math.min.apply(null, allVals);
    var range = max - min || 1;
    var xStep = plotW / (navList.length - 1 || 1);

    function toXY(i, v) {
      var x = padding.left + i * xStep;
      var y = padding.top + ((max - v) / range) * plotH;
      return [x, y];
    }

    ctx.font = '12px -apple-system, sans-serif';
    ctx.fillStyle = '#8a8f99';
    ctx.fillText(max.toFixed(4), 2, padding.top + 6);
    ctx.fillText(min.toFixed(4), 2, cssHeight - padding.bottom + 4);

    ctx.beginPath();
    ctx.strokeStyle = '#eef0f3';
    ctx.lineWidth = 1;
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, cssHeight - padding.bottom);
    ctx.lineTo(cssWidth - padding.right, cssHeight - padding.bottom);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = '#1677ff';
    ctx.lineWidth = 2;
    navList.forEach(function (v, i) {
      var xy = toXY(i, v);
      if (i === 0) ctx.moveTo(xy[0], xy[1]);
      else ctx.lineTo(xy[0], xy[1]);
    });
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = '#e5a800';
    ctx.lineWidth = 1.5;
    var started = false;
    ma20Arr.forEach(function (v, i) {
      if (v === null) return;
      var xy = toXY(i, v);
      if (!started) {
        ctx.moveTo(xy[0], xy[1]);
        started = true;
      } else {
        ctx.lineTo(xy[0], xy[1]);
      }
    });
    ctx.stroke();
  }

  global.FundChart = { drawNavChart: drawNavChart };
})(window);
