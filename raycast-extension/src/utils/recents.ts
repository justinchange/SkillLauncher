import { LocalStorage } from "@raycast/api";

const RECENT_SKILLS_KEY = "recentSkills";
const MAX_RECENT_SKILLS = 5;

export interface RecentSkill {
  name: string;
  timestamp: number;
}

/**
 * Get list of recently used skills
 */
export async function getRecentSkills(): Promise<string[]> {
  const stored = await LocalStorage.getItem<string>(RECENT_SKILLS_KEY);

  if (!stored) {
    return [];
  }

  try {
    const recents: RecentSkill[] = JSON.parse(stored);
    return recents.sort((a, b) => b.timestamp - a.timestamp).map((r) => r.name);
  } catch {
    return [];
  }
}

/**
 * Add a skill to recent skills list
 */
export async function addRecentSkill(skillName: string): Promise<void> {
  const stored = await LocalStorage.getItem<string>(RECENT_SKILLS_KEY);
  let recents: RecentSkill[] = [];

  if (stored) {
    try {
      recents = JSON.parse(stored);
    } catch {
      recents = [];
    }
  }

  // Remove existing entry for this skill
  recents = recents.filter((r) => r.name !== skillName);

  // Add new entry at the beginning
  recents.unshift({
    name: skillName,
    timestamp: Date.now(),
  });

  // Keep only the most recent skills
  recents = recents.slice(0, MAX_RECENT_SKILLS);

  await LocalStorage.setItem(RECENT_SKILLS_KEY, JSON.stringify(recents));
}

/**
 * Clear recent skills
 */
export async function clearRecentSkills(): Promise<void> {
  await LocalStorage.removeItem(RECENT_SKILLS_KEY);
}

/**
 * Check if a skill is in the recent list
 */
export async function isRecentSkill(skillName: string): Promise<boolean> {
  const recents = await getRecentSkills();
  return recents.includes(skillName);
}
