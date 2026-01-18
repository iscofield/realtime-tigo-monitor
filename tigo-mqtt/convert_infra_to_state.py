#!/usr/bin/env python3
"""
Convert infrastructure_report JSON (taptap stdout output) to PersistentState format (taptap state file).

taptap outputs infrastructure_report events with hex string addresses, but reads state files
with byte array addresses. This script performs the conversion.

Usage:
    python3 convert_infra_to_state.py input.json output.state
"""

import json
import sys


def hex_address_to_bytes(hex_addr: str) -> list[int]:
    """Convert hex address string like '04:C0:5B:30:00:04:B3:8C' to byte array [4, 192, 91, ...]."""
    return [int(b, 16) for b in hex_addr.split(':')]


def convert_infrastructure_to_state(infra_data: dict) -> dict:
    """
    Convert infrastructure_report format to PersistentState format.

    Input (infrastructure_report):
    {
        "event_type": "infrastructure_report",
        "gateways": {
            "4609": {"address": "04:C0:5B:30:00:04:B3:8C", "version": "..."}
        },
        "nodes": {
            "4609": {
                "3": {"address": "04:C0:5B:40:00:C3:F2:69", "barcode": "4-C3F269M"}
            }
        }
    }

    Output (PersistentState):
    {
        "gateway_node_tables": {
            "4609": [[3, [4, 192, 91, 64, 0, 195, 242, 105]], ...]
        },
        "gateway_identities": {
            "4609": [4, 192, 91, 48, 0, 4, 179, 140]
        },
        "gateway_versions": {
            "4609": "Mgate Version H1.0004..."
        }
    }
    """
    state = {
        "gateway_node_tables": {},
        "gateway_identities": {},
        "gateway_versions": {}
    }

    # Convert gateways
    gateways = infra_data.get("gateways", {})
    for gw_id, gw_data in gateways.items():
        if "address" in gw_data:
            state["gateway_identities"][gw_id] = hex_address_to_bytes(gw_data["address"])
        if "version" in gw_data:
            state["gateway_versions"][gw_id] = gw_data["version"]

    # Convert nodes - NodeTable serializes as Vec<(NodeID, LongAddress)>
    nodes = infra_data.get("nodes", {})
    for gw_id, gw_nodes in nodes.items():
        node_entries = []
        for node_id, node_data in gw_nodes.items():
            if "address" in node_data:
                # Each entry is [node_id, [address_bytes...]]
                node_entries.append([int(node_id), hex_address_to_bytes(node_data["address"])])
        # Sort by node_id for consistency with BTreeMap
        node_entries.sort(key=lambda x: x[0])
        state["gateway_node_tables"][gw_id] = node_entries

    return state


def main():
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <input.json> <output.state>")
        print("Convert infrastructure_report JSON to PersistentState format for taptap")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    # Read input
    with open(input_path, 'r') as f:
        infra_data = json.load(f)

    # Validate input format
    if infra_data.get("event_type") != "infrastructure_report":
        print(f"Warning: event_type is '{infra_data.get('event_type')}', expected 'infrastructure_report'")

    # Convert
    state_data = convert_infrastructure_to_state(infra_data)

    # Write output
    with open(output_path, 'w') as f:
        json.dump(state_data, f, indent=2)

    # Summary
    num_gateways = len(state_data["gateway_identities"])
    num_nodes = sum(len(nodes) for nodes in state_data["gateway_node_tables"].values())
    print(f"Converted {num_gateways} gateways and {num_nodes} nodes")
    print(f"Output written to: {output_path}")


if __name__ == "__main__":
    main()
