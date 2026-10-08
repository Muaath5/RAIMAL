"""Export dated pivot observations to Raimal's static inspection website.

Real mode requires source identifiers and supplied geometry. This imports
already-derived NDVI; it does not download imagery or confirm physical faults.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

FEATURES = ['ndvi', 'peer_deficit', 'change']
REQUIRED = ['date', 'sector', 'ring', 'ndvi', 'valid_coverage']


def validate(data, synthetic):
    missing = set(REQUIRED) - set(data.columns)
    if missing:
        raise ValueError('Missing columns: ' + ', '.join(sorted(missing)))
    d = data.copy()
    d['date'] = pd.to_datetime(d.date, errors='raise', utc=True).dt.tz_localize(None).dt.normalize()
    if d.empty or d[REQUIRED].isna().any().any():
        raise ValueError('Observations must be nonempty and contain no missing required values.')
    for c in REQUIRED[1:]:
        d[c] = pd.to_numeric(d[c], errors='raise')
        if not np.isfinite(d[c]).all():
            raise ValueError(c + ' must contain finite values.')
    if not d.ndvi.between(-1, 1).all() or not d.valid_coverage.between(0, 1).all():
        raise ValueError('NDVI must be -1..1 and coverage must be 0..1.')
    if not d.sector.between(0, 11).all() or not d.ring.between(0, 3).all():
        raise ValueError('Use zero-based sectors 0..11 and rings 0..3.')
    if ((d.sector % 1 != 0) | (d.ring % 1 != 0)).any():
        raise ValueError('Sector and ring must be integers.')
    if d.duplicated(['date', 'sector', 'ring']).any():
        raise ValueError('One row per date/sector/ring is required. Export one field at a time.')
    for _, g in d.groupby('date'):
        if len(g) != 48:
            raise ValueError('Include all 48 zones on each date, with 0 coverage for unusable zones.')
    if not synthetic:
        needed = ['source_id', 'center_lat', 'center_lon', 'radius_m']
        if set(needed) - set(d.columns) or d[needed].isna().any().any():
            raise ValueError('Real observations require source_id, center_lat, center_lon and radius_m.')
        if not d.source_id.astype(str).str.strip().ne('').all():
            raise ValueError('Every real observation needs a stable source identifier.')
        for c in ['center_lat', 'center_lon', 'radius_m']:
            d[c] = pd.to_numeric(d[c], errors='raise')
            if d[c].nunique() != 1 or not np.isfinite(d[c]).all():
                raise ValueError('Provide one consistent field geometry per file.')
        if not d.center_lat.between(-90, 90).all() or not d.center_lon.between(-180, 180).all() or not d.radius_m.gt(0).all():
            raise ValueError('Invalid field geometry.')
    else:
        d['radius_m'] = 400.0
    d['zone_id'] = [f'S{int(s)+1:02d}-R{int(r)+1}' for s, r in zip(d.sector, d.ring)]
    d['synthetic'] = bool(synthetic)
    d = d.sort_values(['date', 'sector', 'ring']).reset_index(drop=True)
    return d


def build_bundle(data, synthetic=True, label='Synthetic workflow showcase'):
    d = validate(data, synthetic)
    dates = sorted(d.date.unique())
    runs = {}
    # Each coverage choice gets a frozen model trained on its first 8 dates.
    for coverage_pct in [80, 90, 100]:
        cutoff = coverage_pct / 100
        usable = d[d.valid_coverage.ge(cutoff)].copy()
        usable['peer_deficit'] = usable.groupby(['date', 'ring']).ndvi.transform('median') - usable.ndvi
        usable['change'] = usable.groupby('zone_id').ndvi.transform(lambda x: x - x.expanding().median().shift()).fillna(0)
        calibration_dates = sorted(usable.date.unique())[:8]
        model = None
        threshold = None
        training_end = None
        if len(calibration_dates) == 8:
            train = usable[usable.date.isin(calibration_dates)]
            model = IsolationForest(n_estimators=160, random_state=42, contamination='auto')
            model.fit(train[FEATURES])
            threshold = float(np.quantile(-model.score_samples(train[FEATURES]), .94))
            training_end = pd.Timestamp(calibration_dates[-1])
            usable['score'] = -model.score_samples(usable[FEATURES])
            usable['candidate'] = usable.score.gt(threshold) & (usable.peer_deficit.gt(.075) | usable.change.lt(-.07))
        for day in dates:
            day = pd.Timestamp(day)
            current = d[d.date.eq(day)].copy()
            rows = []
            for _, z in current.iterrows():
                zone_history = usable[usable.zone_id.eq(z.zone_id) & usable.date.le(day)]
                count = zone_history.date.nunique()
                valid_now = z.valid_coverage >= cutoff
                evaluation = model is not None and day > training_end
                observed = zone_history[zone_history.date.eq(day)]
                candidate = bool(evaluation and valid_now and not observed.empty and observed.iloc[0].candidate)
                hits = 0
                if evaluation:
                    recent = zone_history[zone_history.date.gt(training_end) & zone_history.date.ge(day - pd.Timedelta(days=20))]
                    hits = int(recent[recent.candidate].date.nunique())
                status = ('withheld' if not valid_now or count < 8 or not evaluation else
                          'inspect' if candidate and hits >= 2 else 'pending' if candidate else 'normal')
                row = z.to_dict()
                row.update(status=status, observation_count=int(count), persistence_count=hits,
                           anomaly_score=float(observed.iloc[0].score) if evaluation and not observed.empty else None,
                           peer_deficit=float(observed.iloc[0].peer_deficit) if not observed.empty else None,
                           radius_start_m=float(z.radius_m * z.ring / 4),
                           radius_end_m=float(z.radius_m * (z.ring + 1) / 4),
                           question='Check water delivery and sprinkler condition; if normal, review crop and soil conditions.')
                rows.append(row)
            stamp = day.strftime('%Y-%m-%d')
            runs[f'{stamp}:{coverage_pct}'] = dict(run_id=f'raimal-{stamp}-{coverage_pct}', analysis_date=stamp,
                synthetic_demo=bool(synthetic), model='Isolation Forest with frozen calibration', zones=rows,
                tasks=[r for r in rows if r['status'] == 'inspect'], threshold=threshold,
                training_end=training_end, gates=dict(minimum_coverage=cutoff, minimum_history_dates=8,
                persistence_dates=2, persistence_window_days=20),
                limitations=['Historical analysis only; no operational dispatch.',
                'Source and geometry are supplied, not independently verified.',
                'Anomaly scores are rankings, not fault probabilities. No field accuracy has been measured.'])
    return dict(schema_version=1, dataset_label=label, synthetic_demo=bool(synthetic),
        provenance='Synthetic fixture' if synthetic else 'User-supplied satellite-derived observations; unverified provenance',
        dates=[pd.Timestamp(t).strftime('%Y-%m-%d') for t in dates],
        observations=d.to_dict(orient='records'), runs=runs)


def serializable(bundle):
    return json.loads(json.dumps(bundle, default=str, allow_nan=False))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('csv', type=Path)
    p.add_argument('--output', type=Path, default=Path('observations.json'))
    p.add_argument('--synthetic', action='store_true', help='Required for any fabricated fixture.')
    p.add_argument('--label', default='Imported satellite observations')
    a = p.parse_args()
    b = serializable(build_bundle(pd.read_csv(a.csv), a.synthetic, a.label))
    a.output.write_text(json.dumps(b, separators=(',', ':')), encoding='utf-8')
    print(f'Wrote {len(b["observations"])} observations; provenance: {b["provenance"]}')


if __name__ == '__main__':
    main()
