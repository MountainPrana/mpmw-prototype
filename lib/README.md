# Libraries

Copied here so the prototype works with no signal. To update, download the new
versions from unpkg.com and replace these files.

| File | Library | Version | License |
| --- | --- | --- | --- |
| maplibre-gl.js, maplibre-gl.css | MapLibre GL JS | 4.7.1 | BSD-3-Clause (maplibre-gl-LICENSE.txt) |
| pmtiles.js | PMTiles | 3.2.1 | BSD-3-Clause |
| magvar.js | magvar (NOAA World Magnetic Model 2025, valid to 2030) | 2.2.0 | MIT (magvar-LICENSE.txt) |

`magvar.js` is the npm package `magvar` (its three files wrapped into one browser script,
code unchanged). It gives the magnetic declination used to turn the compass heading into
true north. WMM2025 is valid until 2030: before then, get the WMM2030 version (`npm pack
magvar`) and rebuild the file the same way.
