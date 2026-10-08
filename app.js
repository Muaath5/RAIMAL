function getRun(date, coveragePct) {
  // coveragePct is the exact percentage entered by the user.
  const userThreshold = Number(coveragePct);
  const cutoff = Math.max(0, Math.min(100, userThreshold)) / 100;

  const observations = (bundle.observations || [])
    .filter(o => String(o.date).slice(0, 10) === date);

  // Keep exactly one observation for each zone.
  // If duplicates exist, use the observation with the highest coverage.
  const bestByZone = new Map();

  for (const o of observations) {
    const coverage = Number(o.valid_coverage);
    const previous = bestByZone.get(o.zone_id);

    if (
      !previous ||
      coverage > Number(previous.valid_coverage)
    ) {
      bestByZone.set(o.zone_id, o);
    }
  }

  const obsOnDate = [...bestByZone.values()];

  // Calculate ring medians using only zones that pass
  // the coverage threshold entered by the user.
  const ringNdvis = new Map();

  for (const o of obsOnDate) {
    const coverage = Number(o.valid_coverage);

    if (
      Number.isFinite(coverage) &&
      coverage >= cutoff &&
      Number.isFinite(o.ndvi)
    ) {
      if (!ringNdvis.has(o.ring)) {
        ringNdvis.set(o.ring, []);
      }

      ringNdvis.get(o.ring).push(o.ndvi);
    }
  }

  const ringMedians = new Map();

  for (const [r, vals] of ringNdvis) {
    vals.sort((a, b) => a - b);

    const mid = Math.floor(vals.length / 2);

    ringMedians.set(
      r,
      vals.length % 2 !== 0
        ? vals[mid]
        : (vals[mid - 1] + vals[mid]) / 2
    );
  }

  let zones = [];

  if (obsOnDate.length > 0) {
    zones = obsOnDate.map(o => {
      const sector =
        o.sector !== undefined
          ? o.sector
          : parseInt(o.zone_id.slice(1, 3)) - 1;

      const ring =
        o.ring !== undefined
          ? o.ring
          : parseInt(o.zone_id.slice(4)) - 1;

      const coverage = Number(o.valid_coverage);

      /*
       * THIS IS THE ONLY CONDITION THAT WITHHOLDS A ZONE.
       *
       * Example:
       *   threshold = 80
       *   coverage  = 79.9%  -> withheld
       *   coverage  = 80.0%  -> NOT withheld
       *   coverage  = 95.0%  -> NOT withheld
       */
      const withheld =
        !Number.isFinite(coverage) ||
        coverage < cutoff;

      const ringMed = ringMedians.get(ring) ?? o.ndvi;
      const deficit = ringMed - o.ndvi;

      let status;

      if (withheld) {
        status = 'withheld';
      } else if (deficit >= 0.07) {
        status = 'inspect';
      } else if (deficit >= 0.045) {
        status = 'pending';
      } else {
        status = 'normal';
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
        valid_coverage: coverage,

        status,

        observation_count:
          (bundle.observations || [])
            .filter(item => item.zone_id === o.zone_id)
            .length,

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
    run_id: `${date}-cov${Math.round(userThreshold)}`,
    analysis_date: date,
    coverage_threshold: userThreshold,
    zones,
    tasks
  };
}
