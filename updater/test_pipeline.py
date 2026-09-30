"""Offline pipeline regression checks: python -m unittest discover -s updater."""

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import h5py
import numpy as np
import requests

import convert_h5_to_png as converter
import download_latest_insat as downloader


class PipelineTests(unittest.TestCase):
    def test_missing_credentials_fail_before_network_request(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(requests, "post") as post:
            with self.assertRaisesRegex(RuntimeError, "MOSDAC_USERNAME"):
                downloader.main()
            post.assert_not_called()

    def test_interrupted_download_preserves_previous_granule(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            previous = folder / "latest.h5"
            previous.write_bytes(b"previous complete granule")
            response = MagicMock()
            response.__enter__.return_value = response

            def interrupted_stream(**kwargs):
                yield b"partial replacement"
                raise requests.ConnectionError("connection interrupted")

            response.iter_content.side_effect = interrupted_stream
            session = MagicMock()
            session.get.return_value = response
            with patch.object(downloader, "DOWNLOAD_FOLDER", folder):
                with self.assertRaises(requests.ConnectionError):
                    downloader.download_file(session, "test-token", "test-id", "latest.h5")
            self.assertEqual(previous.read_bytes(), b"previous complete granule")
            self.assertFalse((folder / "latest.h5.part").exists())

    def test_download_rejects_filename_outside_data_directory(self):
        for filename in ("../escape.h5", "..\\escape.h5", "response.html"):
            with self.subTest(filename=filename), self.assertRaises(ValueError):
                downloader.download_file(MagicMock(), "test-token", "test-id", filename)

    def test_latest_granule_uses_download_time_across_month_boundary(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            older = folder / "3SIMG_30SEP2026_2345_L1B_STD.h5"
            newest = folder / "3SIMG_01OCT2026_0015_L1B_STD.h5"
            older.touch()
            newest.touch()
            os.utime(older, (100, 100))
            os.utime(newest, (200, 200))
            with patch.object(converter, "H5_FOLDER", folder):
                self.assertEqual(converter.find_latest_h5_file(), newest)

    def test_invalid_json_preserves_previous_dataset(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "cloud-grid.json"
            target.write_text('[{"cloudCover": 50}]', encoding="utf-8")
            with self.assertRaises(ValueError):
                converter.save_json([{"cloudCover": float("nan")}], target)
            self.assertEqual(json.loads(target.read_text()), [{"cloudCover": 50}])
            self.assertFalse(target.with_suffix(".json.tmp").exists())

    def test_synthetic_granule_produces_valid_frontend_datasets(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            granule = folder / "latest.h5"
            counts = np.full((1, 80, 80), 2, dtype=np.uint16)
            counts[:, 25:40, 25:40] = 1
            with h5py.File(granule, "w") as h5:
                for channel in ("TIR1", "TIR2", "WV"):
                    h5[f"IMG_{channel}"] = counts
                    h5[f"IMG_{channel}_TEMP"] = np.array([0, 220, 300], dtype=np.float32)
                h5["Latitude"] = np.full((80, 80), 2000, dtype=np.int16)
                h5["Longitude"] = np.full((80, 80), 7500, dtype=np.int16)
            with patch.object(converter, "H5_FOLDER", folder), patch.object(converter, "PUBLIC_FOLDER", folder):
                converter.main()
            grid = json.loads((folder / "cloud-grid.json").read_text())
            cells = json.loads((folder / "thunderstorm-cells.json").read_text())
            self.assertTrue(grid)
            self.assertTrue(cells)
            for point in grid:
                self.assertTrue({"gridLat", "gridLon", "cloudCover", "temp"} <= point.keys())
                self.assertTrue(0 <= point["cloudCover"] <= 100)
            for cell in cells:
                self.assertTrue({"lat", "lon", "temp", "count", "severity", "radius_km", "updated"} <= cell.keys())
                self.assertLess(cell["temp"], converter.STORM_TIR1_MAX_K)
                self.assertGreaterEqual(cell["count"], converter.STORM_MIN_PIXELS)


if __name__ == "__main__":
    unittest.main()
