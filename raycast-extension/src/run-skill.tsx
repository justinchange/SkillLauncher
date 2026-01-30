import {
  Action,
  ActionPanel,
  Detail,
  Icon,
  List,
  Toast,
  showToast,
  LaunchProps,
  useNavigation,
} from "@raycast/api";
import { useState, useEffect, useCallback, useRef } from "react";
import { discoverSkills, getSkillIcon, Skill } from "./utils/skills";
import { runSkill, isClaudeInstalled, ClaudeSession } from "./utils/claude";
import { addRecentSkill } from "./utils/recents";

interface Arguments {
  skillName?: string;
  args?: string;
}

interface QuickExecutionViewProps {
  skill: Skill;
  args: string;
}

function QuickExecutionView({ skill, args }: QuickExecutionViewProps) {
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

interface SkillPickerProps {
  args: string;
  skills: Skill[];
}

function SkillPicker({ args, skills }: SkillPickerProps) {
  const { push } = useNavigation();

  return (
    <List searchBarPlaceholder="Select a skill to run...">
      {skills.map((skill) => (
        <List.Item
          key={skill.name}
          icon={getSkillIcon(skill.name)}
          title={skill.name}
          subtitle={skill.description}
          actions={
            <ActionPanel>
              <Action
                title="Run Skill"
                onAction={() => push(<QuickExecutionView skill={skill} args={args} />)}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

export default function RunSkill(props: LaunchProps<{ arguments: Arguments }>) {
  const { skillName, args } = props.arguments;
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [matchedSkill, setMatchedSkill] = useState<Skill | null>(null);
  const { push } = useNavigation();

  useEffect(() => {
    // Check if Claude is installed
    if (!isClaudeInstalled()) {
      showToast({
        style: Toast.Style.Failure,
        title: "Claude CLI not found",
        message: "Please install Claude Code first",
      });
      setIsLoading(false);
      return;
    }

    // Discover skills
    const discoveredSkills = discoverSkills();
    setSkills(discoveredSkills);

    // If skill name provided, try to find match
    if (skillName) {
      const normalizedName = skillName.toLowerCase().trim();
      const skill = discoveredSkills.find(
        (s) =>
          s.name.toLowerCase() === normalizedName ||
          s.name.toLowerCase().includes(normalizedName)
      );

      if (skill) {
        setMatchedSkill(skill);
        // Auto-run if we found a match
        push(<QuickExecutionView skill={skill} args={args || ""} />);
      } else {
        showToast({
          style: Toast.Style.Failure,
          title: "Skill not found",
          message: `No skill matching "${skillName}"`,
        });
      }
    }

    setIsLoading(false);
  }, [skillName, args, push]);

  if (isLoading) {
    return <List isLoading={true} searchBarPlaceholder="Loading..." />;
  }

  // If skill was matched and auto-run, show empty view briefly
  if (matchedSkill) {
    return <List isLoading={true} />;
  }

  // If no skill name provided, show picker
  if (!skillName) {
    return <SkillPicker args={args || ""} skills={skills} />;
  }

  // Skill not found
  return (
    <List>
      <List.EmptyView
        icon="❓"
        title={`Skill "${skillName}" not found`}
        description="Select from available skills below"
      />
      {skills.map((skill) => (
        <List.Item
          key={skill.name}
          icon={getSkillIcon(skill.name)}
          title={skill.name}
          subtitle={skill.description}
          actions={
            <ActionPanel>
              <Action
                title="Run Skill"
                onAction={() => push(<QuickExecutionView skill={skill} args={args || ""} />)}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
