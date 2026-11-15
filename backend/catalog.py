"""Variable catalogue: what every number in RADIUM is, where it came from and
how far it can be trusted.

Each entry carries
  label, unit, dec     display name, unit, decimals
  cat                  panel group
  evidence             observed | inferred | modelled | computed | interpreted
  source               id in backend/registry.py
  res                  native resolution of the value (never the cell size
                       unless they coincide)
  desc                 one sentence a non-specialist can read
  caveat               optional: the most important limit on its use
  sigma                optional: companion variable holding 1-sigma uncertainty
  layer                optional: {cmap, vmin, vmax, log} → offered as a map layer
"""
from __future__ import annotations

EVIDENCE = {
    "observed": {"label": "Observed", "desc": "Measured by an instrument and gridded by its science team."},
    "inferred": {"label": "Inferred", "desc": "Retrieved from a measurement through a physical relation, such as hydrogen from neutron counts."},
    "modelled": {"label": "Modelled", "desc": "Output of a physical model or reanalysis that is constrained by observations."},
    "computed": {"label": "Computed", "desc": "Calculated by RADIUM from other data with a stated formula."},
    "interpreted": {"label": "Interpreted", "desc": "Mapped or classified by specialists from several data sources."},
}

CATEGORIES = [
    ("terrain", "Terrain"),
    ("thermal", "Surface temperature"),
    ("energy", "Sunlight and energy"),
    ("comm", "Communication"),
    ("water", "Water and ice"),
    ("atmos", "Atmosphere and dust"),
    ("geology", "Composition and geology"),
    ("surface", "Surface cover"),
]


def V(label, unit, cat, evidence, source, res, desc, dec=1, **kw):
    return dict(label=label, unit=unit, cat=cat, evidence=evidence, source=source, res=res, desc=desc, dec=dec, **kw)


L = lambda cmap, vmin, vmax, log=False: dict(cmap=cmap, vmin=vmin, vmax=vmax, log=log)  # noqa: E731

TERRAIN_NOTE = ("Slopes are measured across a baseline of about 3.7 km, the same on all three worlds. "
                "They describe regional relief and understate the slopes a lander or rover meets.")

# --------------------------------------------------------------------- Moon
_moon_comp = {
    "feo_wt": V("Iron oxide (FeO)", "wt%", "geology", "inferred", "lp_grs", "2° ≈ 60 km",
                "Iron content of the regolith; high in mare basalt, low in feldspathic highlands.", 1,
                sigma="feo_wt_sigma", layer=L("ember", 3, 20)),
    "tio2_wt": V("Titanium dioxide (TiO₂)", "wt%", "geology", "inferred", "lp_grs", "2° ≈ 60 km",
                 "Titanium content; tracks ilmenite, a feedstock for oxygen extraction.", 2,
                 sigma="tio2_wt_sigma", layer=L("ember", 0, 8)),
    "al2o3_wt": V("Aluminium oxide (Al₂O₃)", "wt%", "geology", "inferred", "lp_grs", "2° ≈ 60 km",
                  "High in anorthositic highland crust.", 1),
    "mgo_wt": V("Magnesium oxide (MgO)", "wt%", "geology", "inferred", "lp_grs", "2° ≈ 60 km", "Magnesium content of the regolith.", 1),
    "cao_wt": V("Calcium oxide (CaO)", "wt%", "geology", "inferred", "lp_grs", "2° ≈ 60 km", "Calcium content of the regolith.", 1),
    "sio2_wt": V("Silica (SiO₂)", "wt%", "geology", "inferred", "lp_grs", "2° ≈ 60 km", "Silica content of the regolith.", 1),
    "th_ppm": V("Thorium", "ppm", "geology", "inferred", "lp_grs", "2° ≈ 60 km",
                "Marks KREEP-rich terrain concentrated in Oceanus Procellarum.", 2, sigma="th_ppm_sigma", layer=L("ember", 0, 8)),
    "k_ppm": V("Potassium", "ppm", "geology", "inferred", "lp_grs", "2° ≈ 60 km", "Potassium content of the regolith.", 0, sigma="k_ppm_sigma"),
    "h_ppm": V("Hydrogen", "ppm", "water", "inferred", "lp_ns", "0.5° bins, 45 km footprint",
               "Hydrogen in the top metre, from neutron counts. Elevated values near the poles are consistent with water ice.", 0,
               caveat="Cannot tell ice from other hydrogen, and the footprint is far wider than a single cold trap.",
               layer=L("ice", 20, 150)),
}

MOON = {
    "elev_mean": V("Elevation", "m", "terrain", "observed", "lola_gdr", "1.9 km pixels, cell mean",
                   "Mean height above the 1737.4 km reference sphere.", 0, layer=L("topo", -7000, 7000)),
    "slope_med": V("Typical slope", "°", "terrain", "computed", "lola_gdr", "3.8 km baseline",
                   "Median slope within the cell.", 1, caveat=TERRAIN_NOTE, layer=L("slope", 0, 15)),
    "slope_p90": V("Steep-ground slope", "°", "terrain", "computed", "lola_gdr", "3.8 km baseline",
                   "90th-percentile slope: one tenth of the cell is steeper than this.", 1, caveat=TERRAIN_NOTE),
    "rough_iqr": V("Roughness", "m", "terrain", "computed", "lola_gdr", "3.8 km baseline",
                   "Spread of height left after removing the local tilt (inter-quartile range).", 0,
                   layer=L("slope", 5, 250, True)),
    "tmax": V("Daytime maximum", "K", "thermal", "observed", "diviner_gcp", "0.5° ≈ 15 km",
              "Highest bolometric temperature over the lunar day.", 0, layer=L("heat", 100, 400)),
    "tmin": V("Night-time minimum", "K", "thermal", "observed", "diviner_gcp", "0.5° ≈ 15 km",
              "Lowest bolometric temperature over the lunar night.", 0, layer=L("heat", 40, 110)),
    "tmean": V("Mean over the lunar day", "K", "thermal", "observed", "diviner_gcp", "0.5° ≈ 15 km",
               "Average of the measured day–night temperature curve.", 0,
               caveat="Unobserved local-time bins are filled by interpolation for this mean only.", layer=L("heat", 80, 230)),
    "t_cov": V("Local-time coverage", "", "thermal", "observed", "diviner_gcp", "0.5° ≈ 15 km",
               "Share of the 96 local-time bins that hold Diviner observations.", 2, fmt="percent"),
    "illum_frac": V("Time in sunlight", "", "energy", "modelled", "pgda_illum", "240 m, cell mean",
                    "Average fraction of time the Sun is above the local horizon.", 2, fmt="percent",
                    src_var="illum_src",
                    src_map={2: dict(evidence="computed", source=None, res="geometry only",
                                     note="Below 65° latitude no horizon model is used: a smooth sphere sees the Sun half the time. Local shadowing is not included.")},
                    layer=L("lume", 0, 1)),
    "insol_mean": V("Mean insolation, smooth sphere", "W/m²", "energy", "computed", None, "formula",
                    "Annual-mean sunlight on level ground: (1361 W/m² ÷ π) × cos(latitude).", 0,
                    caveat="Ignores topographic shadowing; not meaningful within a few degrees of the poles."),
    "earth_vis": V("Earth in view", "", "comm", "modelled", "pgda_illum", "240 m, cell mean",
                   "Average fraction of time Earth is above the local horizon, for direct radio contact.", 2, fmt="percent",
                   src_var="illum_src",
                   src_map={2: dict(evidence="computed", source=None, res="geometry only",
                                    note="Below 65° latitude: smooth-sphere geometry with a linear ramp across the ±8° libration zone at the limb. Local horizons are not included.")},
                   layer=L("lume", 0, 1)),
    "psr_frac": V("Permanent shadow", "", "water", "modelled", "pgda_illum", "240 m, cell fraction",
                  "Share of the cell that never sees the Sun.", 2, fmt="percent",
                  caveat="Mapped only poleward of 65°.", layer=L("ice", 0, 1)),
    "dist_psr_km": V("Distance to permanent shadow", "km", "water", "computed", "pgda_illum", "240 m mask",
                     "Distance to the nearest mapped permanently shadowed region of at least 1 km².", 1,
                     layer=L("ice_r", 0, 300)),
    **_moon_comp,
}

MOON_POLAR = {
    "elev_mean": V("Elevation", "m", "terrain", "observed", "lola_gdr", "240 m pixels, cell mean",
                   "Mean height above the 1737.4 km reference sphere.", 0, layer=L("topo", -5000, 5000)),
    "slope480_med": V("Local slope, typical", "°", "terrain", "computed", "lola_gdr", "480 m baseline",
                      "Median slope inside this 2.4 km cell.", 1, layer=L("slope", 0, 25)),
    "slope480_p90": V("Local slope, steep ground", "°", "terrain", "computed", "lola_gdr", "480 m baseline",
                      "90th-percentile slope inside this 2.4 km cell.", 1),
    "flat_frac": V("Preliminary terrain suitability", "", "terrain", "computed", "lola_gdr", "240 m pixels, 480 m baseline",
                   "Share of the cell with slope of 10° or less.", 2, fmt="percent",
                   caveat="Measured across 480 m; smaller craters and boulders are not resolved.", layer=L("lume", 0, 1)),
    "slope_med": V("Regional slope, typical", "°", "terrain", "computed", "lola_gdr", "3.8 km baseline, 29 km window",
                   "Median slope of the surrounding 29 km, measured exactly as on Mars and Earth.", 1, caveat=TERRAIN_NOTE),
    "slope_p90": V("Regional slope, steep ground", "°", "terrain", "computed", "lola_gdr", "3.8 km baseline, 29 km window",
                   "90th-percentile slope of the surrounding 29 km.", 1, caveat=TERRAIN_NOTE),
    "rough_iqr": V("Regional roughness", "m", "terrain", "computed", "lola_gdr", "3.8 km baseline, 29 km window",
                   "Spread of height left after removing the local tilt.", 0),
    "tmax": V("Annual maximum", "K", "thermal", "modelled", "diviner_prp", "≈ 500 m mesh, cell mean",
              "Highest surface temperature reached in a year.", 0, layer=L("heat", 40, 320)),
    "tmax_coldest": V("Coldest ground: annual maximum", "K", "thermal", "modelled", "diviner_prp", "≈ 500 m mesh",
                      "Annual maximum temperature of the coldest patch in the cell. Below about 110 K, water ice survives for billions of years.", 0),
    "tmean": V("Annual mean at 2 cm depth", "K", "thermal", "modelled", "diviner_prp", "≈ 500 m mesh, cell mean",
               "Average temperature just below the surface.", 0, layer=L("heat", 30, 200)),
    "illum_frac": V("Time in sunlight, cell mean", "", "energy", "modelled", "pgda_illum", "240 m, cell mean",
                    "Average fraction of time the Sun is above the horizon, averaged over the cell.", 2, fmt="percent",
                    layer=L("lume", 0, 0.6)),
    "illum_flat_max": V("Time in sunlight, best gentle-slope spot", "", "energy", "modelled", "pgda_illum", "single 240 m pixel",
                        "The most-illuminated 240 m patch that is also gentle enough to build on (10° or less).", 2, fmt="percent",
                        caveat="Unavailable when the cell has no ground at 10° or less.", layer=L("lume", 0, 0.9)),
    "illum_max": V("Time in sunlight, best spot of any slope", "", "energy", "modelled", "pgda_illum", "single 240 m pixel",
                   "The most-illuminated 240 m patch in the cell regardless of slope.", 2, fmt="percent"),
    "insol_mean": V("Mean insolation, smooth sphere", "W/m²", "energy", "computed", None, "formula",
                    "Annual-mean sunlight on level ground from latitude alone.", 0,
                    caveat="Not meaningful this close to the pole; use time in sunlight instead."),
    "earth_vis": V("Earth in view", "", "comm", "modelled", "pgda_illum", "240 m, cell mean",
                   "Average fraction of time Earth is above the local horizon.", 2, fmt="percent", layer=L("lume", 0, 1)),
    "psr_frac": V("Permanent shadow", "", "water", "modelled", "pgda_illum", "240 m, cell fraction",
                  "Share of the cell that never sees the Sun.", 2, fmt="percent", layer=L("ice", 0, 1)),
    "dist_psr_km": V("Distance to permanent shadow", "km", "water", "computed", "pgda_illum", "240 m mask",
                     "Mean distance from the cell to the nearest permanently shadowed region of at least 1 km².", 1, layer=L("ice_r", 0, 15)),
    "coldtrap_frac": V("Cold-trap area", "", "water", "modelled", "diviner_prp", "≈ 500 m mesh, cell fraction",
                       "Share of the cell whose annual maximum stays below 110 K.", 2, fmt="percent", layer=L("ice", 0, 1)),
    "ice_surf_frac": V("Ice stable at the surface", "", "water", "modelled", "diviner_prp", "≈ 500 m mesh, cell fraction",
                       "Share of the cell where exposed water ice would survive.", 2, fmt="percent",
                       caveat="Thermal stability only. It does not show that ice is present."),
    "ice_1m_frac": V("Ice stable within 1 m", "", "water", "modelled", "diviner_prp", "≈ 500 m mesh, cell fraction",
                     "Share of the cell where ice would survive at the surface or under up to a metre of dry regolith.", 2, fmt="percent",
                     caveat="Thermal stability only. It does not show that ice is present.", layer=L("ice", 0, 1)),
    **_moon_comp,
}

# --------------------------------------------------------------------- Mars
MARS = {
    "elev_mean": V("Elevation", "m", "terrain", "observed", "mola_megdr", "1.85 km pixels, cell mean",
                   "Mean height above the areoid (the Martian zero level).", 0, layer=L("topo", -8000, 12000)),
    "slope_med": V("Typical slope", "°", "terrain", "computed", "mola_megdr", "3.7 km baseline",
                   "Median slope within the cell.", 1, caveat=TERRAIN_NOTE, layer=L("slope", 0, 10)),
    "slope_p90": V("Steep-ground slope", "°", "terrain", "computed", "mola_megdr", "3.7 km baseline",
                   "90th-percentile slope: one tenth of the cell is steeper than this.", 1, caveat=TERRAIN_NOTE),
    "rough_iqr": V("Roughness", "m", "terrain", "computed", "mola_megdr", "3.7 km baseline",
                   "Spread of height left after removing the local tilt (inter-quartile range).", 0, layer=L("slope", 2, 200, True)),
    "mola_cov": V("Laser-shot coverage", "", "terrain", "observed", "mola_megdr", "1.85 km bins",
                  "Share of elevation bins in the cell that contain a real MOLA measurement; the rest are interpolated.", 2, fmt="percent"),
    "tmean": V("Annual mean", "K", "thermal", "modelled", "mcd", "5.6° × 3.8° model grid",
               "Sol-weighted mean surface temperature over the Martian year.", 0, layer=L("heat", 150, 230)),
    "tmax": V("Warmest afternoon", "K", "thermal", "modelled", "mcd", "5.6° × 3.8° model grid",
              "Surface temperature at 14:00 local time in the warmest of six sampled seasons.", 0, layer=L("heat", 200, 300)),
    "tmin": V("Coldest pre-dawn", "K", "thermal", "modelled", "mcd", "5.6° × 3.8° model grid",
              "Surface temperature at 05:00 local time in the coldest of six sampled seasons.", 0, layer=L("heat", 140, 200)),
    "ps_mean": V("Surface pressure", "Pa", "atmos", "modelled", "mcd", "model grid, adjusted to cell elevation",
                 "Annual-mean pressure, corrected hydrostatically from the model's smoothed topography to this cell's MOLA elevation.", 0,
                 caveat="The seasonal CO₂ cycle moves pressure by roughly a quarter through the year.", layer=L("air", 100, 1100)),
    "ps_seasonal_frac": V("Seasonal pressure swing", "", "atmos", "modelled", "mcd", "5.6° × 3.8° model grid",
                          "Range between the highest and lowest seasonal pressure, relative to the annual mean.", 2, fmt="percent"),
    "dust_tau": V("Dust opacity, annual mean", "", "atmos", "modelled", "mcd", "5.6° × 3.8° model grid",
                  "Visible optical depth of dust above the surface in a typical year.", 2,
                  caveat="Typical-year scenario. Global dust storms are excluded.", layer=L("dust", 0.1, 0.6)),
    "dust_tau_max": V("Dust opacity, dustiest season", "", "atmos", "modelled", "mcd", "5.6° × 3.8° model grid",
                      "Highest seasonal-mean dust optical depth in a typical year.", 2),
    "solar_flux": V("Sunlight at the surface", "W/m²", "energy", "modelled", "mcd", "5.6° × 3.8° model grid",
                    "Annual mean of the day-and-night average solar flux on level ground, after dust and gas extinction.", 0,
                    layer=L("lume", 40, 160)),
    "weh_wt": V("Water-equivalent hydrogen", "wt%", "water", "inferred", "ody_grs", "5° ≈ 300 km (10° smoothing)",
                "Hydrogen in the top decimetres, expressed as if all of it were water.", 1, sigma="weh_wt_sigma",
                caveat="May be ice or hydrated minerals. Not reported poleward of about 57°.", layer=L("ice", 1.5, 7.5)),
    "thermal_inertia": V("Thermal inertia", "J m⁻² K⁻¹ s⁻½", "geology", "modelled", "mcd", "5.6° × 3.8° model grid",
                         "How slowly the ground heats and cools. Low values mean loose dust; high values mean rock or cemented soil.", 0,
                         caveat="The climate model's surface field, built from MGS-TES mapping and smoothed to the model grid.",
                         layer=L("ember", 50, 400)),
    "albedo": V("Albedo", "", "geology", "modelled", "mcd", "5.6° × 3.8° model grid",
                "Share of sunlight the bare ground reflects. Bright regions are dust-mantled.", 2,
                caveat="The climate model's surface field, built from MGS-TES mapping.", layer=L("grey", 0.1, 0.32)),
    "fe_wt": V("Iron", "wt%", "geology", "inferred", "ody_grs", "5° ≈ 300 km", "Iron in the top decimetres.", 1, sigma="fe_wt_sigma", layer=L("ember", 10, 20)),
    "si_wt": V("Silicon", "wt%", "geology", "inferred", "ody_grs", "5° ≈ 300 km", "Silicon in the top decimetres; about 20 wt% is typical of basalt.", 1, sigma="si_wt_sigma"),
    "k_wt": V("Potassium", "wt%", "geology", "inferred", "ody_grs", "5° ≈ 300 km", "Potassium in the top decimetres.", 2, sigma="k_wt_sigma"),
    "cl_wt": V("Chlorine", "wt%", "geology", "inferred", "ody_grs", "5° ≈ 300 km", "Chlorine in the top decimetres; elevated where salts or volcanic exhalations accumulated.", 2, sigma="cl_wt_sigma"),
    "th_ppm": V("Thorium", "ppm", "geology", "inferred", "ody_grs", "5° ≈ 300 km", "Thorium in the top decimetres.", 2, sigma="th_ppm_sigma"),
}

# -------------------------------------------------------------------- Earth
EARTH = {
    "elev_mean": V("Elevation", "m", "terrain", "observed", "etopo2022", "1.85 km pixels, cell mean",
                   "Mean height above sea level (top of the ice on ice sheets).", 0, layer=L("topo", 0, 5500)),
    "slope_med": V("Typical slope", "°", "terrain", "computed", "etopo2022", "3.7 km baseline",
                   "Median slope within the cell.", 1, caveat=TERRAIN_NOTE, layer=L("slope", 0, 10)),
    "slope_p90": V("Steep-ground slope", "°", "terrain", "computed", "etopo2022", "3.7 km baseline",
                   "90th-percentile slope: one tenth of the cell is steeper than this.", 1, caveat=TERRAIN_NOTE),
    "rough_iqr": V("Roughness", "m", "terrain", "computed", "etopo2022", "3.7 km baseline",
                   "Spread of height left after removing the local tilt (inter-quartile range).", 0, layer=L("slope", 2, 200, True)),
    "tmean": V("Annual mean ground temperature", "K", "thermal", "modelled", "power_merra2", "0.5° × 0.625°",
               "Mean skin temperature of the ground, 2001–2020.", 0, layer=L("heat", 215, 305)),
    "tmax": V("Hottest hour", "K", "thermal", "modelled", "power_merra2", "0.5° × 0.625°",
              "Highest hourly ground temperature in the climatological year.", 0),
    "tmin": V("Coldest hour", "K", "thermal", "modelled", "power_merra2", "0.5° × 0.625°",
              "Lowest hourly ground temperature in the climatological year.", 0, layer=L("heat", 190, 300)),
    "t_seasonal": V("Seasonal swing", "K", "thermal", "modelled", "power_merra2", "0.5° × 0.625°",
                    "Warmest-month mean minus coldest-month mean.", 0),
    "ps_mean": V("Surface pressure", "Pa", "atmos", "modelled", "power_merra2", "0.5° × 0.625°",
                 "Annual-mean air pressure at the ground.", 0, layer=L("air", 50000, 102000)),
    "aod55": V("Aerosol optical depth", "", "atmos", "modelled", "power_ceres", "1° ≈ 111 km",
               "Visible (0.55 µm) optical depth of dust, smoke and haze, annual mean.", 2, layer=L("dust", 0, 0.6)),
    "wind10m": V("Wind speed at 10 m", "m/s", "atmos", "modelled", "power_merra2", "0.5° × 0.625°", "Annual-mean wind speed.", 1),
    "solar_flux": V("Sunlight at the surface", "W/m²", "energy", "modelled", "power_ceres", "1° ≈ 111 km",
                    "Annual mean of the day-and-night average solar flux on level ground, all weather.", 0, layer=L("lume", 80, 290)),
    "solar_clear": V("Sunlight at the surface, clear sky", "W/m²", "energy", "modelled", "power_ceres", "1° ≈ 111 km",
                     "The same with clouds removed.", 0),
    "precip_mm_yr": V("Precipitation", "mm/yr", "water", "modelled", "power_merra2", "0.5° × 0.625°",
                      "Annual rain and snow (water equivalent).", 0, layer=L("ice", 10, 2500, True)),
    "soil_wet": V("Surface soil wetness", "", "water", "modelled", "power_merra2", "0.5° × 0.625°",
                  "Moisture in the top 5 cm of soil, from 0 (dry) to 1 (saturated).", 2,
                  caveat="Blanked where the ground is mostly permanent ice, where the reanalysis value has no meaning."),
    "snow_frac": V("Snow cover", "", "water", "modelled", "power_merra2", "0.5° × 0.625°",
                   "Annual-mean share of land under snow.", 2, fmt="percent"),
    "ice_frac": V("Permanent snow and ice", "", "water", "observed", "gibs_modis", "0.05° samples of 500 m classes",
                  "Share of the cell classified as permanent snow or ice.", 2, fmt="percent",
                  caveat="The satellite classification mistakes some bright salt flats for snow. Where mean ground temperature is above 10 °C RADIUM counts that area as barren instead.",
                  layer=L("ice", 0, 1)),
    "ndvi_max": V("Peak greenness (NDVI)", "", "surface", "observed", "gibs_modis", "0.05° samples of 1 km data",
                  "Highest monthly vegetation index in 2019. Below about 0.1 the ground is bare.", 2,
                  caveat="One year, read from colour-mapped imagery in steps of about 0.0075.", layer=L("veg", 0, 0.9)),
    "barren_frac": V("Barren ground", "", "surface", "observed", "gibs_modis", "0.05° samples of 500 m classes",
                     "Share of the cell classified as barren: rock, sand or bare soil.", 2, fmt="percent", layer=L("sand", 0, 1)),
    "veg_frac": V("Vegetated ground", "", "surface", "observed", "gibs_modis", "0.05° samples of 500 m classes",
                  "Share of the cell under forest, shrub, grass, wetland or crops.", 2, fmt="percent"),
    "land_frac": V("Land", "", "surface", "observed", "gibs_modis", "0.05° samples of 500 m classes",
                   "Share of the cell that is not open water.", 2, fmt="percent"),
    "albedo": V("Surface albedo", "", "surface", "modelled", "power_ceres", "1° ≈ 111 km",
                "Share of sunlight the surface reflects, annual mean.", 2),
    "lith": V("Rock type", "", "geology", "interpreted", "glim", "0.5° ≈ 55 km",
              "Dominant mapped lithology of the surrounding 55 km.", 0, fmt="class", classes="lith",
              caveat="One dominant class per 55 km; smaller outcrops do not appear."),
    "igbp_dom": V("Dominant land cover", "", "surface", "observed", "gibs_modis", "0.05° samples of 500 m classes",
                  "Most common MODIS land-cover class in the cell.", 0, fmt="class", classes="igbp"),
}

LITH_CLASSES = {
    1: ("su", "Unconsolidated sediments"), 2: ("vb", "Basic volcanic rocks (basalt)"), 3: ("ss", "Siliciclastic sedimentary rocks"),
    4: ("pb", "Basic plutonic rocks (gabbro, anorthosite)"), 5: ("sm", "Mixed sedimentary rocks"), 6: ("sc", "Carbonate sedimentary rocks"),
    7: ("va", "Acid volcanic rocks (rhyolite)"), 8: ("mt", "Metamorphic rocks"), 9: ("pa", "Acid plutonic rocks (granite)"),
    10: ("vi", "Intermediate volcanic rocks (andesite)"), 11: ("wb", "Water body"), 12: ("py", "Pyroclastics"),
    13: ("pi", "Intermediate plutonic rocks"), 14: ("ev", "Evaporites"), 15: ("nd", "No data"), 16: ("ig", "Ice and glaciers"),
}

IGBP_CLASSES = {
    1: "Evergreen needleleaf forest", 2: "Evergreen broadleaf forest", 3: "Deciduous needleleaf forest",
    4: "Deciduous broadleaf forest", 5: "Mixed forest", 6: "Closed shrubland", 7: "Open shrubland",
    8: "Woody savanna", 9: "Savanna", 10: "Grassland", 11: "Permanent wetland", 12: "Cropland",
    13: "Urban and built-up", 14: "Cropland / natural vegetation mosaic", 15: "Permanent snow and ice",
    16: "Barren", 17: "Water",
}

VARS = {"moon": MOON, "moon_sp": MOON_POLAR, "moon_np": MOON_POLAR, "mars": MARS, "earth": EARTH}

BODIES = {
    "moon": {"name": "Moon", "radius_km": 1737.4, "grids": ["moon_sp", "moon_np", "moon"],
             "cell_note": "Cells are 0.5° (about 15 km). Within 305 km of each pole a separate grid of 2.4 km cells is used."},
    "mars": {"name": "Mars", "radius_km": 3396.0, "grids": ["mars"],
             "cell_note": "Cells are 0.5° (about 30 km at the equator)."},
    "earth": {"name": "Earth", "radius_km": 6371.0, "grids": ["earth"],
              "cell_note": "Cells are 0.25° (about 28 km at the equator). Only cells that are at least half land are analysed."},
}
