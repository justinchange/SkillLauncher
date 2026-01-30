import {
  Action,
  ActionPanel,
  Detail,
  Icon,
  List,
  Toast,
  showToast,
  useNavigation,
  Keyboard,
} from "@raycast/api";
import { useState, useEffect, useCallback, useRef } from "react";
import { discoverSkills, getSkillIcon, skillsDirExists, Skill } from "./utils/skills";
import { runSkill, isClaudeInstalled, ClaudeSession } from "./utils/claude";
import { getRecentSkills, addRecentSkill } from "./utils/recents";

interface SkillItemProps {
  skill: Skill;
  isRecent: boolean;
  onRun: (skill: Skill, args?: string) => void;
}

function SkillItem({ skill, isRecent, onRun }: SkillItemProps) {
  return (
    <List.Item
      icon={getSkillIcon(skill.name)}
      title={skill.name}
      subtitle={skill.description}
      accessories={[
        ...(isRecent ? [{ tag: { value: "Recent", color: "#007AFF" } }] : []),
      ]}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action
              title="Run Skill"
              icon={Icon.Play}
              onAction={() => onRun(skill)}
            />
            <Action
              title="Run with Arguments"
              icon={Icon.Terminal}
              shortcut={{ modifiers: ["cmd"], key: "r" }}
              onAction={() => onRun(skill, "")}
            />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action.Push
              title="View Skill Details"
              icon={Icon.Document}
              shortcut={Keyboard.Shortcut.Common.Open}
              target={<SkillDetailView skill={skill} onRun={onRun} />}
            />
            <Action.OpenWith
              title="Open Skill Folder"
              path={skill.path}
              shortcut={{ modifiers: ["cmd"], key: "o" }}
            />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action.CopyToClipboard
              title="Copy Skill Name"
              content={skill.name}
              shortcut={{ modifiers: ["cmd"], key: "c" }}
            />
            <Action.CopyToClipboard
              title="Copy Skill Command"
              content={`/${skill.name}`}
              shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

interface SkillDetailViewProps {
  skill: Skill;
  onRun: (skill: Skill, args?: string) => void;
}

function SkillDetailView({ skill, onRun }: SkillDetailViewProps) {
  const markdown = `# ${getSkillIcon(skill.name)} ${skill.name}

> ${skill.description}

---

## Skill Instructions

${skill.content || "*No additional instructions*"}

---

**Path:** \`${skill.path}\`
`;

  return (
    <Detail
      markdown={markdown}
      navigationTitle={skill.name}
      actions={
        <ActionPanel>
          <Action
            title="Run Skill"
            icon={Icon.Play}
            onAction={() => onRun(skill)}
          />
          <Action
            title="Run with Arguments"
            icon={Icon.Terminal}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
            onAction={() => onRun(skill, "")}
          />
          <Action.OpenWith
            title="Open Skill Folder"
            path={skill.path}
            shortcut={{ modifiers: ["cmd"], key: "o" }}
          />
        </ActionPanel>
      }
    />
  );
}

interface ExecutionViewProps {
  skill: Skill;
  args: string;
}

function ExecutionView({ skill, args }: ExecutionViewProps) {
  const [output, setOutput] = useState<string>("");
  const [isRunning, setIsRunning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<ClaudeSession | null>(null);

  const stopExecution = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.abort();
      setIsRunning(false);
      showToast({ style: Toast.Style.Success, title: "Execution stopped" });
    }
  }, []);

  useEffect(() => {
    addRecentSkill(skill.name);

    const session = runSkill(skill.name, args, {
      onOutput: (text) => {
        setOutput((prev) => prev + text);
      },
      onError: (err) => {
        setError((prev) => (prev ? prev + "\n" + err : err));
      },
      onComplete: (code) => {
        setIsRunning(false);
        if (code === 0) {
          showToast({ style: Toast.Style.Success, title: "Skill completed" });
        } else if (code !== null) {
          showToast({
            style: Toast.Style.Failure,
            title: "Skill failed",
            message: `Exit code: ${code}`,
          });
        }
      },
    });

    sessionRef.current = session;

    return () => {
      if (session.process && !session.process.killed) {
        session.abort();
      }
    };
  }, [skill.name, args]);

  const command = args ? `/${skill.name} ${args}` : `/${skill.name}`;
  const statusIcon = isRunning ? "🔄" : error ? "❌" : "✅";
  const statusText = isRunning ? "Running..." : error ? "Failed" : "Completed";

  const markdown = `# ${getSkillIcon(skill.name)} ${skill.name}

**Command:** \`${command}\`
**Status:** ${statusIcon} ${statusText}

---

## Output

${output ? "```\n" + output + "\n```" : "*Waiting for output...*"}

${error ? `\n## Errors\n\n\`\`\`\n${error}\n\`\`\`` : ""}
`;

  return (
    <Detail
      markdown={markdown}
      isLoading={isRunning}
      navigationTitle={`Running: ${skill.name}`}
      actions={
        <ActionPanel>
          {isRunning ? (
            <Action
              title="Stop Execution"
              icon={Icon.Stop}
              style={Action.Style.Destructive}
              onAction={stopExecution}
            />
          ) : (
            <Action
              title="Run Again"
              icon={Icon.RotateClockwise}
              onAction={() => {
                setOutput("");
                setError(null);
                setIsRunning(true);
                const session = runSkill(skill.name, args, {
                  onOutput: (text) => setOutput((prev) => prev + text),
                  onError: (err) => setError((prev) => (prev ? prev + "\n" + err : err)),
                  onComplete: (code) => {
                    setIsRunning(false);
                    if (code === 0) {
                      showToast({ style: Toast.Style.Success, title: "Skill completed" });
                    }
                  },
                });
                sessionRef.current = session;
              }}
            />
          )}
          <Action.CopyToClipboard
            title="Copy Output"
            content={output}
            shortcut={{ modifiers: ["cmd"], key: "c" }}
          />
        </ActionPanel>
      }
    />
  );
}

interface RunWithArgsViewProps {
  skill: Skill;
}

function RunWithArgsView({ skill }: RunWithArgsViewProps) {
  const [args, setArgs] = useState("");
  const { push } = useNavigation();

  return (
    <List
      searchBarPlaceholder={`Arguments for /${skill.name}...`}
      onSearchTextChange={setArgs}
      actions={
        <ActionPanel>
          <Action
            title="Run with Arguments"
            icon={Icon.Play}
            onAction={() => push(<ExecutionView skill={skill} args={args} />)}
          />
        </ActionPanel>
      }
    >
      <List.EmptyView
        icon={getSkillIcon(skill.name)}
        title={`/${skill.name}`}
        description={`Enter arguments and press Enter to run\n\n${skill.description}`}
      />
    </List>
  );
}

export default function ListSkills() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [recentSkills, setRecentSkills] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { push } = useNavigation();

  useEffect(() => {
    async function loadData() {
      // Check prerequisites
      if (!isClaudeInstalled()) {
        showToast({
          style: Toast.Style.Failure,
          title: "Claude CLI not found",
          message: "Please install Claude Code first",
        });
      }

      if (!skillsDirExists()) {
        showToast({
          style: Toast.Style.Failure,
          title: "Skills directory not found",
          message: "Create ~/.claude/skills/ to get started",
        });
      }

      // Load skills and recents
      const discoveredSkills = discoverSkills();
      const recents = await getRecentSkills();

      // Sort skills: recent first, then alphabetically
      discoveredSkills.sort((a, b) => {
        const aRecent = recents.indexOf(a.name);
        const bRecent = recents.indexOf(b.name);

        if (aRecent !== -1 && bRecent !== -1) {
          return aRecent - bRecent;
        }
        if (aRecent !== -1) return -1;
        if (bRecent !== -1) return 1;

        return a.name.localeCompare(b.name);
      });

      setSkills(discoveredSkills);
      setRecentSkills(recents);
      setIsLoading(false);
    }

    loadData();
  }, []);

  const handleRunSkill = useCallback(
    (skill: Skill, args?: string) => {
      if (args !== undefined) {
        push(<RunWithArgsView skill={skill} />);
      } else {
        push(<ExecutionView skill={skill} args="" />);
      }
    },
    [push]
  );

  if (isLoading) {
    return <List isLoading={true} searchBarPlaceholder="Loading skills..." />;
  }

  if (skills.length === 0) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Document}
          title="No Skills Found"
          description="Create skills in ~/.claude/skills/ directory"
          actions={
            <ActionPanel>
              <Action.OpenWith
                title="Open Skills Directory"
                path={`${process.env.HOME}/.claude/skills`}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List searchBarPlaceholder="Search skills..." isLoading={isLoading}>
      {skills.map((skill) => (
        <SkillItem
          key={skill.name}
          skill={skill}
          isRecent={recentSkills.includes(skill.name)}
          onRun={handleRunSkill}
        />
      ))}
    </List>
  );
}
