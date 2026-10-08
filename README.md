# Raimal project website

A responsive project website and inspection desk, ready for GitHub Pages.
No build step, cloud database, API key or external font is required. The
included showcase is synthetic and explicitly labeled. Model outputs are
computed in Python, then replayed in the browser.

## Preview

Open `index.html` directly, or serve this folder using
`python -m http.server 8000` and visit `http://localhost:8000`.

## Publish from your existing repository

1. Copy this folder's contents into a `docs` directory at the root of your
   repository. Include `index.html`, `styles.css`, `app.js`, `data.js`,
   `favicon.svg`, `.nojekyll`, `CNAME`, `tools`, and this README.
2. Commit and push to your default branch.
3. In GitHub, open **Settings → Pages**. Choose **Deploy from a branch**,
   select your default branch and the **/docs** folder, then save.
4. In **Settings → Pages → Custom domain**, enter `raimal.muaath.dev`.
   At your DNS provider, point the `raimal` CNAME record to your GitHub
   account's `<owner>.github.io` hostname, without a repository path.
5. Wait for the DNS check, then enable **Enforce HTTPS** when available.
   The submission includes https://raimal.muaath.dev as your intended URL.
   This package does not itself publish the site or configure DNS.

GitHub Pages availability for private repositories depends on your plan.
Confirm visibility before publishing private source or customer data.
Official setup: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site

All website asset paths are relative, so repository subpaths work. Python
cannot run on GitHub Pages. The website reads saved model outputs.

## Import real satellite-derived observations

The importer accepts observations you have already derived from actual
satellite imagery. It does not retrieve rasters, calculate pixel NDVI, verify
crop identity or establish fault causes. Never label fabricated data as real.

1. Prepare a CSV with the headers in `tools/observations-template.csv`.
2. Export **one field** with **48 rows per date**: sector `0..11` clockwise
   from north, ring `0..3` outward from the center. Use equal radial widths.
3. Supply NDVI in `-1..1`, valid coverage in `0..1`, a stable satellite scene
   `source_id`, and the field's `center_lat`, `center_lon`, `radius_m`.
   The geometry must remain constant. Include all zones on every date, using
   coverage 0 for unusable zones. Record a finite placeholder NDVI for those
   unusable zones; they are excluded from model inputs.
4. Install dependencies and export:

   ```bash
   python -m pip install -r tools/requirements.txt
   python tools/export_observations.py your-observations.csv --output observations.json --label "Your field historical observations"
   ```

5. Select **Import observation bundle** in the website. Nothing is uploaded
   to a server. The analysis remains historical and exploratory.

Keep crop calendar and source processing records alongside your CSV. Correct
reflectance scale/offset and pixel-level cloud masking must happen upstream.
Source identifiers are traceability fields, not independent authentication.

For any synthetic CSV, include `--synthetic`; the website preserves that label.
To replace the default showcase, convert a generated bundle to the JavaScript
assignment `window.RAIMAL_DATA = <bundle JSON>;` in `data.js`.

## Model and evidence gates

Isolation Forest uses NDVI, deficit relative to peers on the same ring, and
change relative to a zone's earlier median. Features exclude coverage-failing
observations. Each coverage choice (80%, 90%, 100%) freezes its model and
94th-percentile score threshold on its first eight usable acquisition dates.
Only later dates are eligible for candidates. The zone needs eight usable
dates, a current directional anomaly and two candidate dates after calibration
within 20 days. Settings are engineering assumptions, not agronomic standards.

Training dates remain withheld. No usable calibration history means no tasks.
The desk is a historical replay and does not apply a live data freshness rule.
It cannot issue operational dispatch recommendations. Scores are not equipment
fault probabilities. Field metrics and superiority over a baseline remain
unmeasured. Global ring-wide stress needs separate review; within-ring peer
comparison alone can miss it.

## Records and evidence

Field checks are user entries stored in this browser's local storage. Export
them before clearing browser data or changing device. Entries retain the
synthetic flag and are separate from model evidence. No authentication,
cross-device synchronization or physical-fault verification is provided.

## Market and audience wording

GASTAT's 2024 figures report 89,700 hectares of open-field vegetables; that
includes fields unsuitable for this pivot workflow. No national eligible-pivot
count is established. The revenue calculator assumes SAR 300 per pivot per
year and illustrates arithmetic only. It is neither a validated price nor a
national TAM. Almarai and Fakieh are prospective audiences, not customers or
partners. Almarai's arable operations include overseas farms; Fakieh's initial
route would be feed-crop suppliers, not poultry-house monitoring.

## Sources

- GASTAT Agriculture 2024: https://www.stats.gov.sa/en/w/agricultural-statistics-2024
- GASTAT release: https://www.stats.gov.sa/en/w/news/127
- Almarai 2025 business model: https://annualreport.almarai.com/strategy-and-performance/business-model/
- Fakieh company profile: https://fakiehfarms.com/about-us/
- Sentinel-2: https://dataspace.copernicus.eu/data-collections/copernicus-sentinel-missions/sentinel-2
- Isolation Forest: https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.IsolationForest.html

No company logos or affiliation claims are included. Raimal's wordmark and
pivot schematics are local vector artwork. This package includes no public
repository URL, secret, key or customer dataset.
