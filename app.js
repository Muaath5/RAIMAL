'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const ns = 'http://www.w3.org/2000/svg';
  const colors = { normal: '#5d9273', inspect: '#cf7250', pending: '#c5a750', withheld: '#b9c1b3' };
  let bundle = window.RAIMAL_DATA, run, records = [], selectedZoneId = null;

  try {
    records = JSON.parse(localStorage.getItem('raimal-checks-v1') || '[]');
    if (!Array.isArray(records)) records = [];
  } catch {
    records = [];
  }

  function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }

  function svg(tag, attrs) {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  function option(value, text) {
    const o = node('option', text);
    o.value = value;
    return o;
  }

  function download(obj, filename) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
    const a = node('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function validate(b) {
    if (!b || typeof b !== 'object') throw Error('Invalid observation bundle.');
    if (!Array.isArray(b.dates) || !b.dates.length) {
      if (Array.isArray(b.observations) && b.observations.length > 0) {
        b.dates = Array.from(new Set(b.observations.map(o => String(o.date).slice(0, 10)))).sort();
      } else {
        throw Error('No observation dates found in dataset.');
      }
    }
    if (!Array.isArray(b.observations) || b.observations.length === 0) {
      throw Error('No observations found in dataset.');
    }
    return b;
  }

  function setup() {
    $('date').replaceChildren(...bundle.dates.map(d => option(d, new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }))));
    $('date').value = bundle.dates.at(-1);
    if (!$('coverage').value) $('coverage').value = '80';
    $('dataset-badge').textContent = bundle.synthetic_demo ? 'Synthetic showcase' : 'Imported observations';
    $('provenance').textContent = bundle.synthetic_demo ? 'Synthetic observations · A working inspection workflow, with no real farm or confirmed fault. The model was run in Python; these outputs are replayed here.' : 'Imported satellite-derived observations · Source IDs and geometry are supplied by the uploader and have not been independently verified. Historical review only; no field validation is claimed.';
    render();
  }

  function point(radius, degrees) {
    const a = (degrees - 90) * Math.PI / 180;
    return [250 + radius * Math.cos(a), 250 + radius * Math.sin(a)];
  }

  function sectorPath(sector, ring) {
    const ri = ring * 49, ro = (ring + 1) * 49, a = sector * 30, b = a + 30;
    const p = point(ro, a), q = point(ro, b), t = point(ri, b), u = point(ri, a);
    return ri === 0 ? `M250 250 L${p} A${ro} ${ro} 0 0 1 ${q} Z` : `M${p} A${ro} ${ro} 0 0 1 ${q} L${t} A${ri} ${ri} 0 0 0 ${u} Z`;
  }

  function renderNdviGraph(z, h, analysisDate) {
    const plot = svg('svg', { viewBox: '0 0 380 170', role: 'img', 'aria-label': `${z.zone_id} vegetation index history` });
    const defs = svg('defs', {});
    const grad = svg('linearGradient', { id: 'ndvi-grad', x1: '0', y1: '0', x2: '0', y2: '1' });
    grad.append(
      svg('stop', { offset: '0%', 'stop-color': '#315b42', 'stop-opacity': '0.3' }),
      svg('stop', { offset: '100%', 'stop-color': '#315b42', 'stop-opacity': '0.02' })
    );
    defs.append(grad);
    plot.append(defs);

    const plotX = 48, plotY = 24, plotW = 308, plotH = 104, yBottom = plotY + plotH;

    const validHistory = h.filter(o => Number.isFinite(o.ndvi));
    if (validHistory.length === 0) return plot;

    const minNdvi = Math.min(...validHistory.map(o => o.ndvi));
    const maxNdvi = Math.max(...validHistory.map(o => o.ndvi));
    let yMin = Math.max(-1, Math.floor((minNdvi - 0.05) * 10) / 10);
    let yMax = Math.min(1, Math.ceil((maxNdvi + 0.05) * 10) / 10);
    if (yMax - yMin < 0.2) {
      yMin = Math.max(-1, Math.round((yMin - 0.1) * 10) / 10);
      yMax = Math.min(1, Math.round((yMax + 0.1) * 10) / 10);
    }
    if (yMax <= yMin) yMax = yMin + 0.2;

    // Y gridlines & labels (4 ticks)
    const yTicks = [yMin, yMin + (yMax - yMin) * 0.333, yMin + (yMax - yMin) * 0.666, yMax];
    for (const val of yTicks) {
      const yPos = yBottom - ((val - yMin) / (yMax - yMin)) * plotH;
      plot.append(svg('line', {
        x1: plotX, y1: yPos, x2: plotX + plotW, y2: yPos,
        stroke: '#d8ddd0', 'stroke-width': 1, 'stroke-dasharray': '3 3'
      }));
      plot.append(svg('line', {
        x1: plotX - 5, y1: yPos, x2: plotX, y2: yPos,
        stroke: '#647269', 'stroke-width': 1
      }));
      const txt = svg('text', {
        x: plotX - 8, y: yPos + 3.5,
        'text-anchor': 'end', 'font-size': 11, fill: '#647269',
        'font-family': 'var(--font-sans)'
      });
      txt.textContent = val.toFixed(2);
      plot.append(txt);
    }

    // Y Axis line & title
    plot.append(svg('line', {
      x1: plotX, y1: plotY, x2: plotX, y2: yBottom,
      stroke: '#647269', 'stroke-width': 1.5
    }));
    const yLabel = svg('text', {
      x: 14, y: 18,
      'font-size': 11, 'font-weight': 700, fill: '#173e32',
      'font-family': 'var(--font-sans)', 'letter-spacing': '0.5px'
    });
    yLabel.textContent = 'NDVI';
    plot.append(yLabel);

    // X Axis line & title
    plot.append(svg('line', {
      x1: plotX, y1: yBottom, x2: plotX + plotW, y2: yBottom,
      stroke: '#647269', 'stroke-width': 1.5
    }));
    const xLabel = svg('text', {
      x: plotX + plotW / 2, y: 164,
      'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#173e32',
      'font-family': 'var(--font-sans)', 'letter-spacing': '0.5px'
    });
    xLabel.textContent = 'OBSERVATION DATE';
    plot.append(xLabel);

    // Calculate coordinates
    const points = validHistory.map((o, i) => {
      const x = validHistory.length === 1 ? plotX + plotW / 2 : plotX + (i / (validHistory.length - 1)) * plotW;
      const y = yBottom - ((o.ndvi - yMin) / (yMax - yMin)) * plotH;
      return { x, y, date: String(o.date).slice(0, 10), ndvi: o.ndvi, valid_coverage: o.valid_coverage };
    });

    if (points.length > 1) {
      const firstX = points[0].x, lastX = points[points.length - 1].x;
      const polyPoints = `${firstX},${yBottom} ` + points.map(p => `${p.x},${p.y}`).join(' ') + ` ${lastX},${yBottom}`;
      plot.append(svg('polygon', { points: polyPoints, fill: 'url(#ndvi-grad)' }));
      const ptsStr = points.map(p => `${p.x},${p.y}`).join(' ');
      plot.append(svg('polyline', {
        points: ptsStr, fill: 'none', stroke: '#285446',
        'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
      }));
    }

    // X Ticks & Date Labels
    const tickIndices = points.length <= 5
      ? points.map((_, i) => i)
      : [0, Math.floor(points.length / 4), Math.floor(points.length / 2), Math.floor((3 * points.length) / 4), points.length - 1];

    for (const idx of new Set(tickIndices)) {
      const p = points[idx];
      const dObj = new Date(p.date + 'T00:00:00Z');
      const dateFormatted = dObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
      plot.append(svg('line', {
        x1: p.x, y1: yBottom, x2: p.x, y2: yBottom + 5,
        stroke: '#647269', 'stroke-width': 1
      }));
      const dTxt = svg('text', {
        x: p.x, y: yBottom + 17,
        'text-anchor': 'middle', 'font-size': 10.5, fill: '#647269',
        'font-family': 'var(--font-sans)'
      });
      dTxt.textContent = dateFormatted;
      plot.append(dTxt);
    }

    // Interactive point markers
    for (const p of points) {
      const isCurrent = p.date === analysisDate;
      const circle = svg('circle', {
        cx: p.x, cy: p.y,
        r: isCurrent ? 6 : 3.5,
        fill: isCurrent ? '#cf7250' : '#285446',
        stroke: isCurrent ? '#173e32' : '#fafbf5',
        'stroke-width': isCurrent ? 2 : 1.5,
        cursor: 'pointer'
      });
      const t = svg('title', {});
      t.textContent = `${p.date}: NDVI ${p.ndvi.toFixed(3)} (${Math.round(p.valid_coverage * 100)}% coverage)${isCurrent ? ' [Current observation]' : ''}`;
      circle.append(t);
      plot.append(circle);
    }

    return plot;
  }

  function updateSelectionOutline() {
    const map = $('pivot');
    const existing = document.getElementById('selected-outline');
    if (existing) existing.remove();

    if (!run || !selectedZoneId) return;
    const z = run.zones.find(item => item.zone_id === selectedZoneId);
    if (z) {
      const outline = svg('path', {
        d: sectorPath(z.sector, z.ring),
        fill: 'none',
        stroke: '#1d70b8',
        'stroke-width': 3.5,
        'stroke-linejoin': 'round',
        'pointer-events': 'none',
        id: 'selected-outline'
      });
      map.append(outline);
    }
    if ($('record-zone').value !== selectedZoneId) {
      $('record-zone').value = selectedZoneId;
    }
  }

  function detail(z) {
    if (!z) return;
    selectedZoneId = z.zone_id;
    const box = $('detail');
    box.replaceChildren(node('h3', z.zone_id + ' / Evidence'));

    const startM = Number.isFinite(z.radius_start_m) ? Math.round(z.radius_start_m) : (z.ring * 100);
    const endM = Number.isFinite(z.radius_end_m) ? Math.round(z.radius_end_m) : ((z.ring + 1) * 100);
    const covPct = Number.isFinite(z.valid_coverage) ? Math.round(z.valid_coverage * 100) : 100;
    const ndviVal = Number.isFinite(z.ndvi) ? z.ndvi.toFixed(3) : '—';
    const question = z.question || 'Check water delivery and sprinkler condition; if normal, review crop and soil conditions.';

    for (const text of [
      `Status: ${z.status} · NDVI ${ndviVal}`,
      `${startM}–${endM} m from center · ${z.sector * 30}–${z.sector * 30 + 30}° clockwise from north`,
      `${covPct}% valid coverage · ${z.observation_count || 1} usable dates · ${z.persistence_count || 0} recent candidate observations`,
      question
    ]) {
      box.append(node('p', text));
    }
    if (z.source_id) box.append(node('p', 'Source: ' + z.source_id));

    // Display complete historical observation timeline for this zone across all dates
    const h = (bundle.observations || [])
      .filter(o => o.zone_id === z.zone_id)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));

    if (h.length > 0) {
      const plot = renderNdviGraph(z, h, run.analysis_date);
      box.append(plot, node('p', `NDVI history across ${h.length} observation date(s) · Current date: ${run.analysis_date}`, 'fine'));
    }
    updateSelectionOutline();
  }

  function getRun(date, coveragePct) {
    const cutoff = Math.max(0, Math.min(100, coveragePct)) / 100;
    const obsOnDate = (bundle.observations || []).filter(o => String(o.date).slice(0, 10) === date);

    // Calculate ring medians for deficit detection on this date
    const ringNdvis = new Map();
    for (const o of obsOnDate) {
      if (o.valid_coverage >= cutoff - 1e-6 && Number.isFinite(o.ndvi)) {
        if (!ringNdvis.has(o.ring)) ringNdvis.set(o.ring, []);
        ringNdvis.get(o.ring).push(o.ndvi);
      }
    }
    const ringMedians = new Map();
    for (const [r, vals] of ringNdvis) {
      vals.sort((a, b) => a - b);
      const mid = Math.floor(vals.length / 2);
      ringMedians.set(r, vals.length % 2 !== 0 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2);
    }

    const precomputed = bundle.runs && (
      bundle.runs[`${date}:${coveragePct}`] ||
      bundle.runs[`${date}:80`] ||
      bundle.runs[`${date}:90`] ||
      bundle.runs[`${date}:100`] ||
      Object.values(bundle.runs).find(r => r.analysis_date === date)
    );

    let zones = [];

    if (obsOnDate.length > 0) {
      zones = obsOnDate.map(o => {
        const sector = o.sector !== undefined ? o.sector : parseInt(o.zone_id.slice(1, 3)) - 1;
        const ring = o.ring !== undefined ? o.ring : parseInt(o.zone_id.slice(4)) - 1;
        const meetsThreshold = o.valid_coverage >= (cutoff - 1e-6);
        const ringMed = ringMedians.get(ring) ?? o.ndvi;
        const deficit = ringMed - o.ndvi;

        let status = 'normal';
        if (!meetsThreshold) {
          status = 'withheld';
        } else {
          const baseZ = precomputed && precomputed.zones && precomputed.zones.find(z => z.zone_id === o.zone_id);
          if (baseZ && baseZ.status === 'inspect') {
            status = 'inspect';
          } else if (deficit >= 0.07) {
            status = 'inspect';
          } else if (deficit >= 0.045 || (baseZ && baseZ.status === 'pending')) {
            status = 'pending';
          }
        }

        const isTask = status === 'inspect';

        return {
          zone_id: o.zone_id,
          sector,
          ring,
          sector_name: o.sector_name || `Sector ${sector + 1}`,
          ring_label: o.ring_label || `Ring ${ring + 1}`,
          ring_mid_m: o.ring_mid_m || (ring * 100 + 50),
          radius_start_m: o.radius_start_m ?? (ring * 100),
          radius_end_m: o.radius_end_m ?? ((ring + 1) * 100),
          ndvi: Number(o.ndvi),
          valid_coverage: Number(o.valid_coverage),
          status,
          observation_count: (bundle.observations || []).filter(item => item.zone_id === o.zone_id).length,
          persistence_count: isTask ? 2 : 0,
          question: isTask
            ? `Sector ${String(sector + 1).padStart(2, '0')}: Relative NDVI deficit of ${(deficit * 100).toFixed(1)}% vs ring median. Inspect nozzle pressure, emitter clog, or localized soil stress.`
            : 'Crop condition within expected bounds across this sector.',
          source_id: o.source_id,
          synthetic: bundle.synthetic_demo
        };
      });
    }

    const tasks = zones.filter(z => z.status === 'inspect');
    return {
      run_id: `${date}-cov${Math.round(coveragePct)}`,
      analysis_date: date,
      coverage_threshold: coveragePct,
      zones,
      tasks
    };
  }

  function render() {
    const selectedDate = $('date').value;
    const rawCov = parseFloat($('coverage').value);
    const coveragePct = Number.isFinite(rawCov) ? Math.max(0, Math.min(100, rawCov)) : 80;

    run = getRun(selectedDate, coveragePct);
    const tasks = run.zones.filter(z => z.status === 'inspect');
    const assessedZones = run.zones.filter(z => z.status !== 'withheld');

    $('task-count').textContent = tasks.length;
    $('zone-count').textContent = assessedZones.length;
    $('coverage-stat').textContent = run.zones.length
      ? Math.round(run.zones.reduce((n, z) => n + (Number(z.valid_coverage) || 0), 0) / run.zones.length * 100) + '%'
      : '—';
    $('dates-count').textContent = (bundle.dates && bundle.dates.length) ? bundle.dates.length : 10;

    const map = $('pivot');
    map.replaceChildren();

    for (const z of run.zones) {
      const p = svg('path', {
        d: sectorPath(z.sector, z.ring),
        fill: colors[z.status] || '#5d9273',
        stroke: '#fafbf5',
        'stroke-width': 1.5,
        tabindex: 0,
        role: 'button',
        'aria-label': `${z.zone_id}: ${z.status}, NDVI ${Number(z.ndvi).toFixed(3)}`
      });
      const t = svg('title', {});
      t.textContent = `${z.zone_id} · ${z.status} · ${Math.round(z.valid_coverage * 100)}% coverage`;
      p.append(t);

      p.addEventListener('click', () => detail(z));
      p.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          detail(z);
        }
      });
      map.append(p);
    }

    for (const [text, x, y] of [['N', 250, 33], ['E', 471, 255], ['S', 250, 480], ['W', 29, 255]]) {
      const t = svg('text', {
        x, y, 'text-anchor': 'middle', fill: '#647269',
        'font-size': 14, 'font-family': 'var(--font-sans)', 'font-weight': 700
      });
      t.textContent = text;
      map.append(t);
    }
    map.append(svg('circle', { cx: 250, cy: 250, r: 5, fill: '#183e32' }));

    const queue = $('queue');
    queue.replaceChildren();
    if (!tasks.length) {
      queue.append(node('p', 'No inspection candidate passed all gates for this date. Select another historical date or lower the coverage threshold.', 'empty'));
    }

    const groups = new Map();
    for (const t of tasks) {
      if (!groups.has(t.sector)) groups.set(t.sector, []);
      groups.get(t.sector).push(t);
    }
    for (const [s, zones] of groups) {
      const el = node('article', undefined, 'queue-item');
      el.append(
        node('strong', `Sector ${String(s + 1).padStart(2, '0')} / ${s * 30}–${s * 30 + 30}°`),
        node('p', zones.map(z => z.zone_id).join(', ')),
        node('p', zones[0].question)
      );
      const b = node('button', 'Review evidence ↗');
      b.type = 'button';
      b.addEventListener('click', () => detail(zones[0]));
      el.append(b);
      queue.append(el);
    }

    $('record-zone').replaceChildren(...run.zones.map(z => option(z.zone_id, z.zone_id + ' · ' + z.status)));

    const targetZone = (selectedZoneId && run.zones.find(z => z.zone_id === selectedZoneId)) || tasks[0] || run.zones[0];
    detail(targetZone);
    $('record-status').textContent = records.length ? `${records.length} saved check(s) in this browser.` : '';
  }

  $('date').addEventListener('change', render);
  $('coverage').addEventListener('input', render);
  $('coverage').addEventListener('change', render);
  $('record-zone').addEventListener('change', e => {
    const target = run && run.zones.find(z => z.zone_id === e.target.value);
    if (target) detail(target);
  });
  $('export').addEventListener('click', () => download({ ...run, dataset_label: bundle.dataset_label, provenance: bundle.provenance }, `${run.run_id}.json`));
  $('import').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      if (f.size > 8 * 1024 * 1024) throw Error('Maximum bundle size is 8 MB.');
      const b = validate(JSON.parse(await f.text()));
      bundle = b;
      setup();
      $('message').textContent = 'Observation bundle imported. Review its source identifiers before use.';
    } catch (err) {
      $('message').textContent = 'Import failed: ' + err.message;
    }
    e.target.value = '';
  });
  $('reset').addEventListener('click', () => {
    bundle = window.RAIMAL_DATA;
    $('coverage').value = '80';
    $('message').textContent = '';
    setup();
  });
  $('inspection').addEventListener('submit', e => {
    e.preventDefault();
    const record = {
      run_id: run.run_id,
      dataset: bundle.dataset_label,
      synthetic: bundle.synthetic_demo,
      zone_id: $('record-zone').value,
      observation_date: run.analysis_date,
      finding: $('finding').value,
      measurement_and_follow_up: $('action').value.trim(),
      recorded_at: new Date().toISOString(),
      source: 'User-entered finding; unverified'
    };
    records.push(record);
    try {
      localStorage.setItem('raimal-checks-v1', JSON.stringify(records));
      $('record-status').textContent = 'Saved in this browser. ' + (record.synthetic ? 'This is a synthetic workflow record.' : 'This is a user-entered record, not independently verified.');
    } catch {
      $('record-status').textContent = 'Browser storage is unavailable. Export saved checks now to keep this record.';
    }
    $('action').value = '';
  });
  $('export-records').addEventListener('click', () => download(records, 'raimal-field-checks.json'));

  try {
    validate(bundle);
    setup();
  } catch (err) {
    $('message').textContent = 'Unable to load dataset: ' + err.message;
  }
})();
