# Skill Launcher for Raycast

A Raycast extension for quickly launching and executing [Claude Code](https://claude.ai/code) skills.

## Features

- **Browse Skills**: View all available Claude Code skills from `~/.claude/skills/`
- **Quick Search**: Filter skills by name or description in real-time
- **Run with Arguments**: Execute skills with custom arguments
- **Streaming Output**: See Claude's response in real-time as it generates
- **Recent Skills**: Frequently used skills appear first in the list
- **Skill Details**: View skill instructions and metadata

## Prerequisites

1. **Claude Code CLI** must be installed. The extension looks for it in:
   - `~/.local/bin/claude`
   - `/opt/homebrew/bin/claude`
   - `/usr/local/bin/claude`

2. **Skills Directory**: Create skills in `~/.claude/skills/`

## Installation

### From Source

1. Clone this repository
2. Navigate to the `raycast-extension` directory
3. Install dependencies:
   ```bash
   npm install
   ```
4. Build and import into Raycast:
   ```bash
   npm run dev
   ```

### From Raycast Store

Coming soon!

## Usage

### List Skills Command

1. Open Raycast
2. Type "List Skills" or use your configured hotkey
3. Browse or search for a skill
4. Press Enter to run the skill
5. Use `Cmd+R` to run with custom arguments

### Run Skill Command

1. Open Raycast
2. Type "Run Skill"
3. Enter the skill name and optional arguments
4. Press Enter to execute

## Creating Skills

Skills are Markdown files with YAML frontmatter stored in `~/.claude/skills/[skill-name]/SKILL.md`:

```markdown
---
name: my-skill
description: Brief description of what this skill does
---

# Skill Instructions

Your skill prompt and instructions here...
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Run skill |
| `Cmd+R` | Run with arguments |
| `Cmd+O` | Open skill folder |
| `Cmd+C` | Copy skill name |
| `Cmd+Shift+C` | Copy skill command |

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Lint code
npm run lint
```

## License

MIT License - see [LICENSE](../LICENSE) for details.
