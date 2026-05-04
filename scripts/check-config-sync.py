#!/usr/bin/env python3
"""Check that config-template.ini and tigo_mqtt_generator.py stay in sync.

Compares the INI structure (sections, keys, default values) between the
config template and what the generator produces.  Flags drift so that
changes to one aren't silently lost in the other.

Known intentional differences are listed in KNOWN_DIFFS and suppressed.

Usage:
    python3 scripts/check-config-sync.py          # from repo root
    python3 scripts/check-config-sync.py --strict  # exit 1 on any diff (for CI)
"""

import configparser
import io
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TEMPLATE_PATH = REPO_ROOT / "tigo-mqtt" / "config-template.ini"
GENERATOR_PATH = (
    REPO_ROOT / "dashboard" / "backend" / "app" / "tigo_mqtt_generator.py"
)

# (section, key): description of why this intentionally differs
KNOWN_DIFFS = {
    ("TAPTAP", "UPDATE"): "template=60 (conservative), generator=5 (real-time)",
    ("TAPTAP", "SERIAL"): "template has placeholder device, generator uses cca.serial_device",
    ("TAPTAP", "MODULES"): "template has placeholder, generator uses computed modules_line",
    ("TAPTAP", "TOPIC_NAME"): "template has static default, generator uses cca.name",
    ("MQTT", "SERVER"): "template uses env var ref, generator uses env var substitution",
    ("MQTT", "PORT"): "template uses env var ref, generator uses env var substitution",
    ("MQTT", "USER"): "template has placeholder, generator uses env var substitution",
    ("MQTT", "PASS"): "template has placeholder, generator uses env var substitution",
}


def parse_template(path: Path) -> dict[str, dict[str, str]]:
    """Parse INI file into {section: {key: value}} dict."""
    config = configparser.ConfigParser(interpolation=None)
    config.optionxform = str  # preserve case
    config.read(str(path))
    return {
        section: dict(config[section])
        for section in config.sections()
    }


def extract_generator_ini(path: Path) -> str | None:
    """Extract the first INI f-string from generate_ini_config().

    Looks for the return f\"\"\"...\"\"\" block in the generate_ini_config
    function and strips Python f-string interpolations to get a raw INI
    template for structural comparison.
    """
    source = path.read_text()

    # Find generate_ini_config function's f-string
    match = re.search(
        r'def generate_ini_config\b.*?return f"""(.*?)"""',
        source,
        re.DOTALL,
    )
    if not match:
        return None

    ini_text = match.group(1)

    # Replace f-string expressions with placeholder values so configparser
    # can parse the structure.  We only care about section/key presence.
    # {cca.name} -> PLACEHOLDER
    # ${MQTT_SERVER} -> PLACEHOLDER (env var refs)
    # {modules_line} -> PLACEHOLDER
    ini_text = re.sub(r'\$\{(\w+)\}', r'PLACEHOLDER_ENV', ini_text)
    ini_text = re.sub(r'\{[^}]+\}', 'PLACEHOLDER', ini_text)

    return ini_text


def parse_ini_string(text: str) -> dict[str, dict[str, str]]:
    """Parse INI text into {section: {key: value}} dict."""
    config = configparser.ConfigParser(interpolation=None)
    config.optionxform = str  # preserve case
    config.read_string(text)
    return {
        section: dict(config[section])
        for section in config.sections()
    }


def compare_structures(
    template: dict[str, dict[str, str]],
    generator: dict[str, dict[str, str]],
) -> list[str]:
    """Compare two INI structures and return list of difference descriptions."""
    diffs = []

    all_sections = sorted(set(template.keys()) | set(generator.keys()))

    for section in all_sections:
        t_keys = set(template.get(section, {}).keys())
        g_keys = set(generator.get(section, {}).keys())

        for key in sorted(t_keys - g_keys):
            if (section, key) not in KNOWN_DIFFS:
                diffs.append(
                    f"  [{section}] {key}: in template but MISSING from generator"
                )

        for key in sorted(g_keys - t_keys):
            if (section, key) not in KNOWN_DIFFS:
                diffs.append(
                    f"  [{section}] {key}: in generator but MISSING from template"
                )

    return diffs


def main() -> int:
    strict = "--strict" in sys.argv

    if not TEMPLATE_PATH.exists():
        print(f"ERROR: Template not found: {TEMPLATE_PATH}")
        return 1

    if not GENERATOR_PATH.exists():
        print(f"ERROR: Generator not found: {GENERATOR_PATH}")
        return 1

    # Parse template
    template = parse_template(TEMPLATE_PATH)

    # Extract and parse generator
    gen_ini = extract_generator_ini(GENERATOR_PATH)
    if gen_ini is None:
        print("ERROR: Could not extract INI f-string from generator")
        return 1

    generator = parse_ini_string(gen_ini)

    # Compare
    diffs = compare_structures(template, generator)

    # Report known diffs
    print("Config sync check: config-template.ini vs tigo_mqtt_generator.py")
    print(f"  Template sections: {sorted(template.keys())}")
    print(f"  Generator sections: {sorted(generator.keys())}")
    print()

    if KNOWN_DIFFS:
        print(f"Known intentional differences ({len(KNOWN_DIFFS)}):")
        for (section, key), reason in sorted(KNOWN_DIFFS.items()):
            print(f"  [{section}] {key}: {reason}")
        print()

    if diffs:
        print(f"UNEXPECTED differences ({len(diffs)}):")
        for d in diffs:
            print(d)
        print()
        print("If intentional, add to KNOWN_DIFFS in this script.")
        return 1 if strict else 0
    else:
        print("No unexpected structural differences found.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
