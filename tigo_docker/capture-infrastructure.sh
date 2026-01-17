#!/bin/bash
#
# Capture infrastructure report from Tigo CCA and create state file
#
# Usage: ./capture-infrastructure.sh <serial_device> <output_state_file> [timeout_seconds]
#
# Example:
#   ./capture-infrastructure.sh /dev/ttyACM2 data/primary/taptap.state
#   ./capture-infrastructure.sh /dev/ttyACM3 data/secondary/taptap.state 600
#

set -e

SERIAL_DEVICE="${1:-/dev/ttyACM2}"
OUTPUT_STATE_FILE="${2:-data/taptap.state}"
TIMEOUT_SECONDS="${3:-600}"  # Default 10 minutes

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONVERT_SCRIPT="${SCRIPT_DIR}/convert_infra_to_state.py"
TEMP_JSON="/tmp/infrastructure_report_$$.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}TapTap Infrastructure Capture${NC}"
echo "================================"
echo "Serial device: ${SERIAL_DEVICE}"
echo "Output file:   ${OUTPUT_STATE_FILE}"
echo "Timeout:       ${TIMEOUT_SECONDS} seconds"
echo ""

# Check prerequisites
if [ ! -e "${SERIAL_DEVICE}" ]; then
    echo -e "${RED}Error: Serial device ${SERIAL_DEVICE} not found${NC}"
    exit 1
fi

if [ ! -f "${CONVERT_SCRIPT}" ]; then
    echo -e "${RED}Error: Conversion script not found at ${CONVERT_SCRIPT}${NC}"
    exit 1
fi

# Check if taptap binary is available
TAPTAP_BIN=""
if command -v taptap &> /dev/null; then
    TAPTAP_BIN="taptap"
elif [ -x "/usr/local/bin/taptap" ]; then
    TAPTAP_BIN="/usr/local/bin/taptap"
else
    echo -e "${RED}Error: taptap binary not found${NC}"
    echo "Install taptap or run this script inside the taptap container"
    exit 1
fi

echo -e "${YELLOW}Starting taptap to capture infrastructure report...${NC}"
echo "This may take several minutes. Press Ctrl+C to abort."
echo ""

# Run taptap and capture the first infrastructure_report event
# The script will exit as soon as we get the infrastructure report
capture_infrastructure() {
    timeout "${TIMEOUT_SECONDS}" "${TAPTAP_BIN}" observe --serial "${SERIAL_DEVICE}" 2>/dev/null | while IFS= read -r line; do
        # Check if this line is an infrastructure_report
        if echo "$line" | grep -q '"event_type".*"infrastructure_report"'; then
            echo "$line" > "${TEMP_JSON}"
            echo -e "${GREEN}Infrastructure report captured!${NC}"
            # Kill the parent timeout/taptap process
            kill $$ 2>/dev/null || true
            exit 0
        fi
        # Show progress for other events
        event_type=$(echo "$line" | grep -o '"event_type"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        if [ -n "$event_type" ]; then
            echo "  Received: ${event_type}"
        fi
    done
}

# Trap to cleanup on exit
cleanup() {
    if [ -f "${TEMP_JSON}" ] && [ ! -s "${TEMP_JSON}" ]; then
        rm -f "${TEMP_JSON}"
    fi
}
trap cleanup EXIT

# Run the capture
capture_infrastructure &
CAPTURE_PID=$!

# Wait for capture to complete
wait $CAPTURE_PID 2>/dev/null || true

# Check if we got the infrastructure report
if [ ! -s "${TEMP_JSON}" ]; then
    echo ""
    echo -e "${RED}Error: No infrastructure report received within ${TIMEOUT_SECONDS} seconds${NC}"
    echo ""
    echo "Possible causes:"
    echo "  - CCA is not connected or powered on"
    echo "  - Serial device is incorrect"
    echo "  - Tigo system hasn't sent infrastructure report yet"
    echo ""
    echo "Try:"
    echo "  - Increase timeout: $0 ${SERIAL_DEVICE} ${OUTPUT_STATE_FILE} 1800"
    echo "  - Check serial connection: ls -la ${SERIAL_DEVICE}"
    echo "  - Run taptap manually: taptap observe --serial ${SERIAL_DEVICE}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Converting to state file format...${NC}"

# Convert the infrastructure report to state file format
python3 "${CONVERT_SCRIPT}" "${TEMP_JSON}" "${OUTPUT_STATE_FILE}"

# Cleanup temp file
rm -f "${TEMP_JSON}"

echo ""
echo -e "${GREEN}Success! State file created at: ${OUTPUT_STATE_FILE}${NC}"
echo ""
echo "Next steps:"
echo "  1. Restart the taptap container to load the new state file"
echo "  2. Check logs for 'Permanently enumerated' messages"
echo ""
