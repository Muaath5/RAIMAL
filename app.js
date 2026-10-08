--- app.js
+++ app.js
@@
   function getRun(date, coveragePct) {
-    const cutoff = Math.max(0, Math.min(100, coveragePct)) / 100;
+    // `coveragePct` is the value currently entered by the user (0–100).
+    // Convert that exact user-entered percentage to the 0–1 coverage scale
+    // used by the observations.
+    const userThresholdPct = Number(coveragePct);
+    const cutoff = Math.max(0, Math.min(100, userThresholdPct)) / 100;
     const obsOnDate = (bundle.observations || []).filter(o => String(o.date).slice(0, 10) === date);
@@
-    const precomputed = bundle.runs && (
-      bundle.runs[`${date}:${coveragePct}`] ||
-      bundle.runs[`${date}:80`] ||
-      bundle.runs[`${date}:90`] ||
-      bundle.runs[`${date}:100`] ||
-      Object.values(bundle.runs).find(r => r.analysis_date === date)
-    );
+    // Do not fall back to precomputed runs with a different threshold.
+    // The threshold selected by the user must be authoritative.
+    const precomputed = bundle.runs && bundle.runs[`${date}:${userThresholdPct}`];
@@
-        const meetsThreshold = o.valid_coverage >= (cutoff - 1e-6);
+        // A zone is withheld ONLY when its coverage is below the
+        // threshold entered by the user. Zones at or above the threshold
+        // must never be withheld because of a saved/precomputed status.
+        const coverage = Number(o.valid_coverage);
+        const meetsThreshold = Number.isFinite(coverage) && coverage >= cutoff;
@@
-          const baseZ = precomputed && precomputed.zones && precomputed.zones.find(z => z.zone_id === o.zone_id);
+          const baseZ = precomputed && precomputed.zones &&
+            precomputed.zones.find(z => z.zone_id === o.zone_id);
