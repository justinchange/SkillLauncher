#!/bin/bash

# Build Script for Skill Launcher
# This script builds and optionally installs the Skill Launcher app

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔨 Building Skill Launcher...${NC}"

# Build release version
swift build -c release 2>&1 | grep -v "warning:"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Build successful!${NC}"
    echo ""

    # Show binary info
    BINARY_PATH=".build/release/SkillLauncher"
    SIZE=$(ls -lh "$BINARY_PATH" | awk '{print $5}')
    echo -e "Binary: ${YELLOW}$BINARY_PATH${NC}"
    echo -e "Size: ${YELLOW}$SIZE${NC}"
    echo ""

    # Ask about installation
    if [ "$1" == "--install" ]; then
        INSTALL_PATH="/usr/local/bin/SkillLauncher"
        echo -e "${YELLOW}Installing to $INSTALL_PATH...${NC}"
        cp "$BINARY_PATH" "$INSTALL_PATH"
        echo -e "${GREEN}✅ Installed! Run 'SkillLauncher' to start.${NC}"
    else
        echo "To install to /usr/local/bin, run:"
        echo -e "  ${YELLOW}./build.sh --install${NC}"
        echo ""
        echo "Or run directly:"
        echo -e "  ${YELLOW}.build/release/SkillLauncher${NC}"
    fi
else
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi
