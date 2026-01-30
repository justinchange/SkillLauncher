import { homedir } from "os";
import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { join } from "path";
import matter from "gray-matter";

export interface Skill {
  name: string;
  description: string;
  path: string;
  content: string;
}

const SKILLS_DIR = join(homedir(), ".claude", "skills");

/**
 * Get emoji icon for a skill based on its name
 */
export function getSkillIcon(name: string): string {
  const lowered = name.toLowerCase();

  if (lowered.includes("log") || lowered.includes("debug")) return "📋";
  if (lowered.includes("test")) return "🧪";
  if (lowered.includes("build") || lowered.includes("compile")) return "🔨";
  if (lowered.includes("deploy")) return "🚀";
  if (lowered.includes("git") || lowered.includes("commit")) return "📝";
  if (lowered.includes("search") || lowered.includes("find")) return "🔍";
  if (lowered.includes("clean") || lowered.includes("clear")) return "🧹";
  if (lowered.includes("run") || lowered.includes("start") || lowered.includes("launch")) return "▶️";
  if (lowered.includes("stop") || lowered.includes("kill")) return "⏹️";
  if (lowered.includes("config") || lowered.includes("setting")) return "⚙️";
  if (lowered.includes("doc") || lowered.includes("readme")) return "📖";
  if (lowered.includes("api")) return "🔌";
  if (lowered.includes("database") || lowered.includes("db")) return "🗄️";
  if (lowered.includes("auth") || lowered.includes("login")) return "🔐";
  if (lowered.includes("mail") || lowered.includes("email")) return "📧";
  if (lowered.includes("chat") || lowered.includes("message")) return "💬";
  if (lowered.includes("image") || lowered.includes("photo")) return "🖼️";
  if (lowered.includes("video")) return "🎬";
  if (lowered.includes("music") || lowered.includes("audio")) return "🎵";
  if (lowered.includes("file")) return "📁";
  if (lowered.includes("download")) return "⬇️";
  if (lowered.includes("upload")) return "⬆️";
  if (lowered.includes("sync")) return "🔄";
  if (lowered.includes("backup")) return "💾";
  if (lowered.includes("restore")) return "♻️";
  if (lowered.includes("analyze") || lowered.includes("report")) return "📊";
  if (lowered.includes("format") || lowered.includes("lint")) return "✨";
  if (lowered.includes("refactor")) return "🔧";
  if (lowered.includes("security") || lowered.includes("scan")) return "🛡️";
  if (lowered.includes("help") || lowered.includes("info")) return "ℹ️";

  return "⚡";
}

/**
 * Discover all skills from the skills directory
 */
export function discoverSkills(): Skill[] {
  const skills: Skill[] = [];

  if (!existsSync(SKILLS_DIR)) {
    return skills;
  }

  try {
    const entries = readdirSync(SKILLS_DIR);

    for (const entry of entries) {
      const skillPath = join(SKILLS_DIR, entry);
      const skillFile = join(skillPath, "SKILL.md");

      // Check if it's a directory with a SKILL.md file
      if (statSync(skillPath).isDirectory() && existsSync(skillFile)) {
        try {
          const content = readFileSync(skillFile, "utf-8");
          const { data, content: markdownContent } = matter(content);

          skills.push({
            name: data.name || entry,
            description: data.description || "No description",
            path: skillPath,
            content: markdownContent.trim(),
          });
        } catch (err) {
          // Skip malformed skill files
          console.error(`Error reading skill ${entry}:`, err);
        }
      }
    }
  } catch (err) {
    console.error("Error discovering skills:", err);
  }

  return skills;
}

/**
 * Get skills directory path
 */
export function getSkillsDir(): string {
  return SKILLS_DIR;
}

/**
 * Check if skills directory exists
 */
export function skillsDirExists(): boolean {
  return existsSync(SKILLS_DIR);
}
