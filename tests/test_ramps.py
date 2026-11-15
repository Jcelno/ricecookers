import numpy as np
from fastapi.testclient import TestClient

from backend import render
from backend.app import app


def test_legend_rgba_uses_exactly_the_rendered_pixel_transfer():
    samples = np.linspace(0, 1, 9)
    for name in render.CMAPS:
        pixels = render.colorize(samples, name, 0, 1)
        expected = ["#%02x%02x%02x%02x" % tuple(int(v) for v in pixel) for pixel in pixels]
        assert render.legend_stops(name) == expected


def test_continuous_layers_share_ramp_without_changing_grade_colours():
    for name in render.CMAPS:
        if name != "grey":
            assert render.CMAPS[name] == render.CONTINUOUS_RAMP
    assert render.GRADE_COLORS == {"A": "#56c8f5", "B": "#86d6b9", "C": "#ecdf9a", "D": "#f0a55a", "F": "#de5d57"}


def test_high_values_are_more_visible_but_missing_is_never_a_zero():
    image = render.colorize(np.array([np.nan, -10, 0, 0.5, 1, 5]), "slope", 0, 1)
    assert image[0, 3] == 0
    assert image[1, 3] == image[2, 3] > 0
    assert image[2, 3] < image[3, 3] < image[4, 3]
    assert image[4, 3] == image[5, 3] == 235
    assert tuple(image[0, :3]) == tuple(image[1, :3])  # no black no-data fringe


def test_logarithmic_layers_preserve_real_endpoints_and_alpha():
    image = render.colorize(np.array([1, 10, 100]), "slope", 1, 100, log=True)
    expected = render.colorize(np.array([0, 0.5, 1]), "slope", 0, 1)
    assert np.array_equal(image, expected)
    meta = TestClient(app).get("/api/meta").json()
    layer = next(l for l in meta["layers"]["mars"]["grid"] if l["id"] == "rough_iqr")
    assert layer["legend"]["log"]
    assert layer["legend"]["min"] == 2 and layer["legend"]["max"] == 200
    assert layer["legend"]["stops"] == render.legend_stops("slope")
