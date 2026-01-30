import { spawn, ChildProcess } from "child_process";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

/**
 * Find the Claude CLI binary
 */
export function findClaudeBinary(): string | null {
  const possiblePaths = [
    join(homedir(), ".local", "bin", "claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
    "/usr/bin/claude",
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}

/**
 * Check if Claude CLI is installed
 */
export function isClaudeInstalled(): boolean {
  return findClaudeBinary() !== null;
}

export interface StreamEvent {
  type: string;
  content?: string;
  message?: {
    content?: Array<{
      type: string;
      text?: string;
    }>;
  };
}

/**
 * Parse streaming JSON output from Claude CLI
 */
export function parseStreamJson(data: string): string {
  const lines = data.split("\n").filter((line) => line.trim());
  let result = "";

  for (const line of lines) {
    try {
      const event: StreamEvent = JSON.parse(line);

      // Handle different event types
      if (event.type === "content_block_delta" && event.content) {
        result += event.content;
      } else if (event.type === "assistant" && event.message?.content) {
        for (const block of event.message.content) {
          if (block.type === "text" && block.text) {
            result += block.text;
          }
        }
      } else if (event.type === "result" && event.message?.content) {
        for (const block of event.message.content) {
          if (block.type === "text" && block.text) {
            result += block.text;
          }
        }
      }
    } catch {
      // Not JSON, might be regular output
      if (line && !line.startsWith("{")) {
        result += line;
      }
    }
  }

  return result;
}

export interface ClaudeSession {
  process: ChildProcess | null;
  abort: () => void;
}

export interface RunOptions {
  onOutput: (text: string) => void;
  onError: (error: string) => void;
  onComplete: (exitCode: number | null) => void;
  workingDirectory?: string;
}

/**
 * Run a Claude command with streaming output
 */
export function runClaudeCommand(command: string, options: RunOptions): ClaudeSession {
  const claudePath = findClaudeBinary();

  if (!claudePath) {
    options.onError("Claude CLI not found. Please install Claude Code first.");
    options.onComplete(1);
    return { process: null, abort: () => {} };
  }

  const args = ["-p", command, "--output-format", "stream-json", "--verbose"];

  const proc = spawn(claudePath, args, {
    cwd: options.workingDirectory || homedir(),
    env: {
      ...process.env,
      PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin`,
    },
  });

  let buffer = "";

  proc.stdout?.on("data", (data: Buffer) => {
    buffer += data.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.trim()) {
        const parsed = parseStreamJson(line);
        if (parsed) {
          options.onOutput(parsed);
        }
      }
    }
  });

  proc.stderr?.on("data", (data: Buffer) => {
    const text = data.toString();
    // Filter out verbose debug messages
    if (!text.includes("[DEBUG]") && !text.includes("[INFO]")) {
      options.onError(text);
    }
  });

  proc.on("close", (code) => {
    // Process any remaining buffer
    if (buffer.trim()) {
      const parsed = parseStreamJson(buffer);
      if (parsed) {
        options.onOutput(parsed);
      }
    }
    options.onComplete(code);
  });

  proc.on("error", (err) => {
    options.onError(err.message);
    options.onComplete(1);
  });

  return {
    process: proc,
    abort: () => {
      if (proc && !proc.killed) {
        proc.kill("SIGTERM");
      }
    },
  };
}

/**
 * Run a skill command
 */
export function runSkill(skillName: string, args: string, options: RunOptions): ClaudeSession {
  const command = args ? `/${skillName} ${args}` : `/${skillName}`;
  return runClaudeCommand(command, options);
}
