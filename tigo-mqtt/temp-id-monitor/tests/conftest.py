"""Make the sidecar module importable from tests without installing the package.

The pure helpers (parse_mapping/merge_mapping/regexes/publish gate) import even
when aiomqtt is absent, because temp_id_monitor guards that import — so these
unit tests need no MQTT broker and no extra dependencies beyond pytest.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
