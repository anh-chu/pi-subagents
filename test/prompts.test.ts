import { beforeEach, describe, expect, it } from "vitest";
import { getAgentConfig, registerAgents } from "../src/agent-types.js";
import { buildAgentPrompt } from "../src/prompts.js";
import type { AgentConfig, EnvInfo } from "../src/types.js";

const env: EnvInfo = {
  isGitRepo: true,
  branch: "main",
  platform: "darwin",
};

const envNoGit: EnvInfo = {
  isGitRepo: false,
  branch: "",
  platform: "linux",
};

// Initialize default agents
beforeEach(() => {
  registerAgents(new Map());
});

function getDefaultConfig(name: string): AgentConfig {
  return getAgentConfig(name)!;
}

describe("buildAgentPrompt", () => {
  it("includes cwd and git info", () => {
    const config = getDefaultConfig("general-purpose");
    const prompt = buildAgentPrompt(config, "/workspace", env);
    expect(prompt).toContain("/workspace");
    expect(prompt).toContain("Branch: main");
    expect(prompt).toContain("darwin");
  });

  it("handles non-git repos", () => {
    const config = getDefaultConfig("Explore");
    const prompt = buildAgentPrompt(config, "/workspace", envNoGit);
    expect(prompt).toContain("Not a git repository");
    expect(prompt).not.toContain("Branch:");
  });

  it("Explore prompt is read-only", () => {
    const config = getDefaultConfig("Explore");
    const prompt = buildAgentPrompt(config, "/workspace", env);
    expect(prompt).toContain("Read-only file and content search specialist");
    expect(prompt).toContain("Does NOT create, modify, or delete files");
  });

  it("Plan prompt is read-only", () => {
    const config = getDefaultConfig("Plan");
    const prompt = buildAgentPrompt(config, "/workspace", env);
    expect(prompt).toContain("Read-only mode");
    expect(prompt).toContain("Multi-Step Implementation Strategy");
  });

  it("general-purpose uses append mode (parent twin)", () => {
    const config = getDefaultConfig("general-purpose");
    const parentPrompt = "You are a parent coding agent with full powers.";
    const prompt = buildAgentPrompt(config, "/workspace", env, parentPrompt);
    expect(prompt).toContain("parent coding agent with full powers");
    expect(prompt).toContain("<sub_agent_context>");
    expect(prompt).toContain("<inherited_system_prompt>");
    expect(prompt).not.toContain("Read-only");
    // Empty systemPrompt means no <agent_instructions> section
    expect(prompt).not.toContain("<agent_instructions>");
  });

  it("general-purpose without parent prompt falls back to generic base", () => {
    const config = getDefaultConfig("general-purpose");
    const prompt = buildAgentPrompt(config, "/workspace", env);
    expect(prompt).toContain("general-purpose coding agent");
    expect(prompt).not.toContain("Read-only");
  });

  it("append mode with parent prompt includes parent + custom instructions", () => {
    const config: AgentConfig = {
      name: "appender",
      description: "Appender",
      builtinToolNames: [],
      extensions: true,
      skills: true,
      systemPrompt: "Extra custom instructions here.",
      promptMode: "append",
      inheritContext: false,
      runInBackground: false,
      isolated: false,
    };
    const parentPrompt = "You are a parent coding agent with special powers.";
    const prompt = buildAgentPrompt(config, "/workspace", env, parentPrompt);
    expect(prompt).toContain("/workspace");
    expect(prompt).toContain("parent coding agent with special powers");
    expect(prompt).toContain("<sub_agent_context>");
    expect(prompt).toContain("<inherited_system_prompt>");
    expect(prompt).toContain("<agent_instructions>");
    expect(prompt).toContain("Extra custom instructions here.");
  });

  it("append mode without parent prompt falls back to generic base", () => {
    const config: AgentConfig = {
      name: "appender",
      description: "Appender",
      builtinToolNames: [],
      extensions: true,
      skills: true,
      systemPrompt: "Extra custom instructions here.",
      promptMode: "append",
      inheritContext: false,
      runInBackground: false,
      isolated: false,
    };
    const prompt = buildAgentPrompt(config, "/workspace", env);
    expect(prompt).toContain("/workspace");
    expect(prompt).toContain("general-purpose coding agent");
    expect(prompt).toContain("Extra custom instructions here.");
  });

  it("append mode with empty systemPrompt is a pure parent clone", () => {
    const config: AgentConfig = {
      name: "clone",
      description: "Clone",
      builtinToolNames: [],
      extensions: true,
      skills: true,
      systemPrompt: "",
      promptMode: "append",
      inheritContext: false,
      runInBackground: false,
      isolated: false,
    };
    const parentPrompt = "You are a parent coding agent.";
    const prompt = buildAgentPrompt(config, "/workspace", env, parentPrompt);
    expect(prompt).toContain("parent coding agent");
    expect(prompt).toContain("<sub_agent_context>");
    expect(prompt).toContain("<inherited_system_prompt>");
    expect(prompt).not.toContain("<agent_instructions>");
  });

  it("replace mode uses config systemPrompt directly", () => {
    const config: AgentConfig = {
      name: "custom",
      description: "Custom",
      builtinToolNames: [],
      extensions: true,
      skills: true,
      systemPrompt: "You are a specialized agent.",
      promptMode: "replace",
      inheritContext: false,
      runInBackground: false,
      isolated: false,
    };
    const prompt = buildAgentPrompt(config, "/workspace", env);
    expect(prompt).toContain("You are a specialized agent.");
    expect(prompt).toContain("/workspace");
    expect(prompt).toContain("You are a pi coding agent sub-agent");
  });

  it("replace mode ignores parent prompt", () => {
    const config: AgentConfig = {
      name: "standalone",
      description: "Standalone",
      builtinToolNames: [],
      extensions: true,
      skills: true,
      systemPrompt: "You are a standalone agent.",
      promptMode: "replace",
      inheritContext: false,
      runInBackground: false,
      isolated: false,
    };
    const prompt = buildAgentPrompt(config, "/workspace", env, "SECRET parent prompt content");
    expect(prompt).toContain("You are a standalone agent.");
    expect(prompt).not.toContain("SECRET parent prompt content");
    expect(prompt).not.toContain("<sub_agent_context>");
  });

  it("append mode bridge contains tool reminders", () => {
    const config = getDefaultConfig("general-purpose");
    const prompt = buildAgentPrompt(config, "/workspace", env, "Parent prompt.");
    expect(prompt).toContain("Use the read tool instead of cat");
    expect(prompt).toContain("Use the edit tool instead of sed");
    expect(prompt).toContain("Use the grep tool instead of");
  });

  it("append mode without parent prompt still has bridge", () => {
    const config: AgentConfig = {
      name: "no-parent",
      description: "No parent",
      builtinToolNames: [],
      extensions: true,
      skills: true,
      systemPrompt: "Extra stuff.",
      promptMode: "append",
      inheritContext: false,
      runInBackground: false,
      isolated: false,
    };
    const prompt = buildAgentPrompt(config, "/workspace", env);
    expect(prompt).toContain("<sub_agent_context>");
    expect(prompt).toContain("<inherited_system_prompt>");
    expect(prompt).toContain("Use the read tool instead of cat");
    expect(prompt).toContain("general-purpose coding agent");
    expect(prompt).toContain("Extra stuff.");
  });

  it("injects memory block in replace mode", () => {
    const config: AgentConfig = {
      name: "mem-agent",
      description: "Memory Agent",
      builtinToolNames: [],
      extensions: true,
      skills: true,
      systemPrompt: "You are a memory agent.",
      promptMode: "replace",
      inheritContext: false,
      runInBackground: false,
      isolated: false,
    };
    const extras = { memoryBlock: "# Agent Memory\nYou have persistent memory at /tmp/mem/" };
    const prompt = buildAgentPrompt(config, "/workspace", env, undefined, extras);
    expect(prompt).toContain("You are a memory agent.");
    expect(prompt).toContain("Agent Memory");
    expect(prompt).toContain("persistent memory");
  });

  it("injects memory block in append mode", () => {
    const config: AgentConfig = {
      name: "mem-append",
      description: "Memory Append",
      builtinToolNames: [],
      extensions: true,
      skills: true,
      systemPrompt: "Custom instructions.",
      promptMode: "append",
      inheritContext: false,
      runInBackground: false,
      isolated: false,
    };
    const extras = { memoryBlock: "# Agent Memory\nPersistent memory here." };
    const prompt = buildAgentPrompt(config, "/workspace", env, "Parent prompt.", extras);
    expect(prompt).toContain("<sub_agent_context>");
    expect(prompt).toContain("Agent Memory");
    expect(prompt).toContain("Custom instructions.");
  });

  it("injects preloaded skill blocks", () => {
    const config: AgentConfig = {
      name: "skill-agent",
      description: "Skill Agent",
      builtinToolNames: [],
      extensions: true,
      skills: true,
      systemPrompt: "You are a skill agent.",
      promptMode: "replace",
      inheritContext: false,
      runInBackground: false,
      isolated: false,
    };
    const extras = {
      skillBlocks: [
        { name: "api-conventions", content: "Use REST endpoints." },
        { name: "error-handling", content: "Handle errors gracefully." },
      ],
    };
    const prompt = buildAgentPrompt(config, "/workspace", env, undefined, extras);
    expect(prompt).toContain("Preloaded Skill: api-conventions");
    expect(prompt).toContain("Use REST endpoints.");
    expect(prompt).toContain("Preloaded Skill: error-handling");
    expect(prompt).toContain("Handle errors gracefully.");
  });

  it("injects both memory and skills", () => {
    const config: AgentConfig = {
      name: "full-agent",
      description: "Full Agent",
      builtinToolNames: [],
      extensions: true,
      skills: true,
      systemPrompt: "Full agent.",
      promptMode: "replace",
      inheritContext: false,
      runInBackground: false,
      isolated: false,
    };
    const extras = {
      memoryBlock: "# Memory\nRemember this.",
      skillBlocks: [{ name: "skill1", content: "Skill content." }],
    };
    const prompt = buildAgentPrompt(config, "/workspace", env, undefined, extras);
    expect(prompt).toContain("# Memory");
    expect(prompt).toContain("Preloaded Skill: skill1");
  });

  it("no extras means no extra sections", () => {
    const config: AgentConfig = {
      name: "plain",
      description: "Plain",
      builtinToolNames: [],
      extensions: true,
      skills: true,
      systemPrompt: "Plain agent.",
      promptMode: "replace",
      inheritContext: false,
      runInBackground: false,
      isolated: false,
    };
    const prompt = buildAgentPrompt(config, "/workspace", env);
    expect(prompt).not.toContain("Agent Memory");
    expect(prompt).not.toContain("Preloaded Skill");
  });

  describe("agent-mode context", () => {
    it("append mode with agent-mode context excludes inherited_system_prompt and sub_agent_context", () => {
      const config: AgentConfig = {
        name: "agent-mode-append",
        description: "Agent mode append",
        builtinToolNames: [],
        extensions: true,
        skills: true,
        systemPrompt: "Append-mode custom instructions.",
        promptMode: "append",
        inheritContext: false,
        runInBackground: false,
        isolated: false,
      };
      const parentPrompt = "Parent system prompt.";
      const prompt = buildAgentPrompt(config, "/workspace", env, parentPrompt, undefined, { context: "agent-mode" });
      expect(prompt).toContain("<active_agent name=\"agent-mode-append\"/>");
      expect(prompt).toContain("<agent_instructions>");
      expect(prompt).toContain("Append-mode custom instructions.");
      expect(prompt).not.toContain("<inherited_system_prompt>");
      expect(prompt).not.toContain("<sub_agent_context>");
      expect(prompt).not.toContain("general-purpose coding agent");
      expect(prompt).not.toContain("Parent system prompt");
    });

    it("append mode with agent-mode context and empty systemPrompt has no agent_instructions", () => {
      const config: AgentConfig = {
        name: "agent-mode-append-empty",
        description: "Agent mode append empty",
        builtinToolNames: [],
        extensions: true,
        skills: true,
        systemPrompt: "",
        promptMode: "append",
        inheritContext: false,
        runInBackground: false,
        isolated: false,
      };
      const prompt = buildAgentPrompt(config, "/workspace", env, undefined, undefined, { context: "agent-mode" });
      expect(prompt).toContain("<active_agent name=\"agent-mode-append-empty\"/>");
      expect(prompt).toContain("# Environment");
      expect(prompt).not.toContain("<agent_instructions>");
      expect(prompt).not.toContain("<inherited_system_prompt>");
      expect(prompt).not.toContain("<sub_agent_context>");
    });

    it("replace mode ignores context option", () => {
      const config: AgentConfig = {
        name: "replace-agent",
        description: "Replace agent",
        builtinToolNames: [],
        extensions: true,
        skills: true,
        systemPrompt: "Replace mode instructions.",
        promptMode: "replace",
        inheritContext: false,
        runInBackground: false,
        isolated: false,
      };
      const prompt = buildAgentPrompt(config, "/workspace", env, undefined, undefined, { context: "agent-mode" });
      expect(prompt).toContain("Replace mode instructions.");
      expect(prompt).not.toContain("<inherited_system_prompt>");
      expect(prompt).not.toContain("<sub_agent_context>");
    });
  });

  describe("default context (spawn)", () => {
    it("append mode without context option defaults to spawn behavior", () => {
      const config: AgentConfig = {
        name: "default-append",
        description: "Default append",
        builtinToolNames: [],
        extensions: true,
        skills: true,
        systemPrompt: "Custom instructions.",
        promptMode: "append",
        inheritContext: false,
        runInBackground: false,
        isolated: false,
      };
      const parentPrompt = "Parent prompt.";
      const prompt = buildAgentPrompt(config, "/workspace", env, parentPrompt);
      expect(prompt).toContain("<inherited_system_prompt>");
      expect(prompt).toContain("<sub_agent_context>");
      expect(prompt).toContain("Parent prompt.");
    });

    it("append mode with explicit spawn context includes inherited_system_prompt and sub_agent_context", () => {
      const config: AgentConfig = {
        name: "spawn-append",
        description: "Spawn append",
        builtinToolNames: [],
        extensions: true,
        skills: true,
        systemPrompt: "Spawn custom instructions.",
        promptMode: "append",
        inheritContext: false,
        runInBackground: false,
        isolated: false,
      };
      const parentPrompt = "Parent prompt for spawn.";
      const prompt = buildAgentPrompt(config, "/workspace", env, parentPrompt, undefined, { context: "spawn" });
      expect(prompt).toContain("<inherited_system_prompt>");
      expect(prompt).toContain("<sub_agent_context>");
      expect(prompt).toContain("Parent prompt for spawn.");
      expect(prompt).toContain("Spawn custom instructions.");
    });
  });

  describe("active_agent tag", () => {
    it("tag is present at start of prompt in replace mode", () => {
      const config: AgentConfig = {
        name: "my-agent",
        description: "Test",
        builtinToolNames: [],
        extensions: true,
        skills: true,
        systemPrompt: "You are a test agent.",
        promptMode: "replace",
        inheritContext: false,
        runInBackground: false,
        isolated: false,
      };
      const prompt = buildAgentPrompt(config, "/workspace", env);
      expect(prompt).toMatch(/^<active_agent name="my-agent"\/>/);
    });

    it("tag is present at start of prompt in append mode", () => {
      const config: AgentConfig = {
        name: "my-agent",
        description: "Test",
        builtinToolNames: [],
        extensions: true,
        skills: true,
        systemPrompt: "Custom instructions.",
        promptMode: "append",
        inheritContext: false,
        runInBackground: false,
        isolated: false,
      };
      const prompt = buildAgentPrompt(config, "/workspace", env, "Parent prompt.");
      expect(prompt).toMatch(/^<active_agent name="my-agent"\/>/);
    });

    it("tag uses agent name verbatim", () => {
      const config: AgentConfig = {
        name: "Some Agent With Spaces",
        description: "Test",
        builtinToolNames: [],
        extensions: true,
        skills: true,
        systemPrompt: "Test.",
        promptMode: "replace",
        inheritContext: false,
        runInBackground: false,
        isolated: false,
      };
      const prompt = buildAgentPrompt(config, "/workspace", env);
      expect(prompt).toContain('<active_agent name="Some Agent With Spaces"/>');
    });

    it("tag appears before the env block in both modes", () => {
      for (const promptMode of ["replace", "append"] as const) {
        const config: AgentConfig = {
          name: "test-agent",
          description: "Test",
          builtinToolNames: [],
          extensions: true,
          skills: true,
          systemPrompt: "Test.",
          promptMode,
          inheritContext: false,
          runInBackground: false,
          isolated: false,
        };
        const prompt = buildAgentPrompt(config, "/workspace", env, "Parent.");
        const tagIndex = prompt.indexOf('<active_agent name="test-agent"/>');
        const envIndex = prompt.indexOf("# Environment");
        expect(tagIndex).toBeLessThan(envIndex);
      }
    });

    it("strips project_instructions blocks from parent prompt in append mode", () => {
      const parentWithProjectInstructions = `You are the parent agent.

<project_instructions path=".pi/agents/AGENTS.md">
# Available Agents
Some agent definitions.
</project_instructions>

Other parent context.`;

      const config: AgentConfig = {
        name: "child-agent",
        description: "Child",
        builtinToolNames: [],
        extensions: true,
        skills: true,
        systemPrompt: "Child instructions.",
        promptMode: "append",
        inheritContext: false,
        runInBackground: false,
        isolated: false,
      };

      const prompt = buildAgentPrompt(config, "/workspace", env, parentWithProjectInstructions);

      // Verify project_instructions block is not in the inherited_system_prompt section
      expect(prompt).not.toContain("<project_instructions");
      expect(prompt).not.toContain("Available Agents");
      expect(prompt).toContain("You are the parent agent.");
      expect(prompt).toContain("Other parent context.");
      expect(prompt).toContain("<inherited_system_prompt>");
      expect(prompt).toContain("<sub_agent_context>");
    });

    it("strips multiple project_instructions blocks and preserves similar-named tags", () => {
      const parentWithMultipleBlocks = `Start.

<project_instructions path=".pi/agents/AGENTS.md">
# Block 1
Content 1.
</project_instructions>

Middle text.

<project_instructions path=".pi/agents/skills.md">
# Block 2
Content 2.
</project_instructions>

<project_instructions_backup>
Backup content should remain.
</project_instructions_backup>

End.`;

      const config: AgentConfig = {
        name: "child-agent",
        description: "Child",
        builtinToolNames: [],
        extensions: true,
        skills: true,
        systemPrompt: "Child instructions.",
        promptMode: "append",
        inheritContext: false,
        runInBackground: false,
        isolated: false,
      };

      const prompt = buildAgentPrompt(config, "/workspace", env, parentWithMultipleBlocks);

      // Verify both project_instructions blocks are stripped
      expect(prompt).not.toContain("Block 1");
      expect(prompt).not.toContain("Block 2");
      expect(prompt).not.toContain("Content 1");
      expect(prompt).not.toContain("Content 2");
      // Verify similar-named tag is preserved
      expect(prompt).toContain("<project_instructions_backup>");
      expect(prompt).toContain("Backup content should remain.");
      // Verify surrounding text remains
      expect(prompt).toContain("Start.");
      expect(prompt).toContain("Middle text.");
      expect(prompt).toContain("End.");
    });
  });
});
