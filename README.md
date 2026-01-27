# SkillLauncher

A lightweight macOS launcher for [Claude Code](https://claude.ai/code) Skills. Press `Option+Space` to quickly search and execute your Skills with real-time streaming output.

![macOS](https://img.shields.io/badge/macOS-14.0+-blue)
![Swift](https://img.shields.io/badge/Swift-5.9-orange)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **Global Hotkey** - `Option+Space` to summon from anywhere
- **Smart Search** - Filter Skills by name or description
- **Streaming Output** - See Claude's response character by character
- **Recent Skills** - Frequently used Skills appear first
- **Native macOS** - Built with Swift & SwiftUI, minimal resource usage

## Requirements

- macOS 14.0 (Sonoma) or later
- [Claude Code CLI](https://claude.ai/code) installed
- Skills configured in `~/.claude/skills/`

## Installation

### Build from Source

```bash
git clone https://github.com/Ceeon/SkillLauncher.git
cd SkillLauncher
swift build -c release
```

The binary will be at `.build/release/SkillLauncher`.

### Run

```bash
# Run directly
.build/release/SkillLauncher

# Or copy to Applications
cp .build/release/SkillLauncher /Applications/
```

The app runs in the menu bar (look for the command icon).

## Usage

| Shortcut | Action |
|----------|--------|
| `Option+Space` | Show/hide launcher |
| `↑` `↓` | Navigate skills |
| `Tab` | Autocomplete skill name |
| `Enter` | Execute command |
| `Esc` | Clear input / Close |

### Example

1. Press `Option+Space`
2. Type `gem` to filter skills
3. Press `Tab` to autocomplete: `/gemini-image `
4. Add your prompt: `/gemini-image a cat wearing sunglasses`
5. Press `Enter` and watch the streaming response

## How It Works

SkillLauncher scans `~/.claude/skills/` for directories containing `SKILL.md` files. It parses the YAML frontmatter to extract skill names and descriptions.

When you execute a command, it runs:
```bash
claude -p "your command" --output-format stream-json --verbose --include-partial-messages
```

The streaming JSON output is parsed in real-time to display Claude's response as it generates.

## Configuration

Skills are automatically discovered from `~/.claude/skills/`. Each skill should have a `SKILL.md` file with YAML frontmatter:

```markdown
---
name: my-skill
description: A brief description of what this skill does
---

# Skill Instructions

Your skill prompt here...
```

## Project Structure

```
SkillLauncher/
├── Package.swift                    # Swift Package Manager config
├── Sources/SkillLauncher/
│   └── App.swift                    # Main application (~500 lines)
└── README.md
```

## Dependencies

- [HotKey](https://github.com/soffes/HotKey) - Global keyboard shortcuts
- [Yams](https://github.com/jpsim/Yams) - YAML parsing

## Troubleshooting

### Hotkey not working?

Grant accessibility permissions in **System Settings > Privacy & Security > Accessibility**.

### Claude CLI not found?

Ensure Claude CLI is installed. SkillLauncher looks for it in:
- `~/.local/bin/claude`
- `/opt/homebrew/bin/claude`
- `/usr/local/bin/claude`

### No skills showing?

Check that your skills directory exists and contains valid `SKILL.md` files:
```bash
ls ~/.claude/skills/
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- Built for use with [Claude Code](https://claude.ai/code) by Anthropic
- UI inspired by [Raycast](https://raycast.com)
