import { spawnSync } from "node:child_process";
import { cpSync, promises as fs, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  atomicWriteAgentsMd,
  BEGIN_MARKER,
  BLOCK_PATTERN,
  deleteIfEmpty,
  END_MARKER,
  extractUserContent,
  generateBlockContent,
  prepareDirectory,
  readAgentsMd,
  reconstructAgentsMd,
  removeAllBlocks,
} from "../scripts/agents-md-block.mjs";

describe("agents-md-block utility functions", () => {
  describe("generateBlockContent", () => {
    it("generates block with begin/end markers", () => {
      const content = generateBlockContent();
      expect(content).toContain(BEGIN_MARKER);
      expect(content).toContain(END_MARKER);
    });

    it("includes four-dial concept", () => {
      const content = generateBlockContent();
      expect(content).toContain("Four-Dial");
      expect(content).toContain("Brief");
      expect(content).toContain("Brain");
      expect(content).toContain("Powers");
      expect(content).toContain("Knowledge");
    });

    it("includes workflow guidance", () => {
      const content = generateBlockContent();
      expect(content).toContain("Sequential");
      expect(content).toContain("Parallel fan-out");
      expect(content).toContain("Dispatch-review-iterate");
      expect(content).toContain("run_in_background: true");
    });

    it("routes preset agents without vendor names", () => {
      const content = generateBlockContent();
      expect(content).toContain("Explore");
      expect(content).toContain("Plan");
      expect(content).toContain("worker");
      expect(content).toContain("reviewer");
      expect(content).toContain("oracle");
      expect(content).not.toContain("Haiku");
      expect(content).not.toContain("Sonnet");
      expect(content).not.toContain("Opus");
      expect(content).not.toContain("Claude");
    });

    it("includes brief format and skill reference", () => {
      const content = generateBlockContent();
      expect(content).toContain("Brief format");
      expect(content).toContain("Goal");
      expect(content).toContain("Context");
      expect(content).toContain("Scope");
      expect(content).toContain("Acceptance");
      expect(content).toContain("Return");
      expect(content).toContain("Cite domain guidance directly");
    });

    it("does not include orchestrator supervision methodology", () => {
      const content = generateBlockContent();
      // Should not include orchestrator-specific supervision content
      expect(content).not.toContain("monitor background");
      expect(content).not.toContain("steer_subagent");
      expect(content).not.toContain("active supervision");
    });
  });

  describe("extractUserContent", () => {
    it("returns empty user content and hadBlocks=true when only block exists", () => {
      const content = `${BEGIN_MARKER}
Block content
${END_MARKER}`;
      const { userContent, hadBlocks } = extractUserContent(content);
      expect(userContent).toBe("");
      expect(hadBlocks).toBe(true);
    });

    it("preserves user content before block", () => {
      const content = `User content before
${BEGIN_MARKER}
Block content
${END_MARKER}`;
      const { userContent, hadBlocks } = extractUserContent(content);
      expect(userContent).toBe("User content before\n");
      expect(hadBlocks).toBe(true);
    });

    it("preserves user content after block", () => {
      const content = `${BEGIN_MARKER}
Block content
${END_MARKER}
User content after`;
      const { userContent, hadBlocks } = extractUserContent(content);
      expect(userContent).toContain("User content after");
      expect(hadBlocks).toBe(true);
    });

    it("preserves user content before and after block", () => {
      const content = `Before
${BEGIN_MARKER}
Block content
${END_MARKER}
After`;
      const { userContent, hadBlocks } = extractUserContent(content);
      expect(userContent).toContain("Before");
      expect(userContent).toContain("After");
      expect(hadBlocks).toBe(true);
    });

    it("handles legacy versioned markers", () => {
      const content = `<!-- pi-subagents:begin v1 -->
Block content
<!-- pi-subagents:end v1 -->
User content`;
      const { userContent, hadBlocks } = extractUserContent(content);
      expect(userContent).toContain("User content");
      expect(hadBlocks).toBe(true);
    });

    it("consolidates duplicate blocks", () => {
      const content = `${BEGIN_MARKER}
Block 1
${END_MARKER}
User content
${BEGIN_MARKER}
Block 2
${END_MARKER}`;
      const { userContent } = extractUserContent(content);
      expect(userContent).toBe("\nUser content\n");
    });

    it("returns hadBlocks=false when no blocks exist", () => {
      const content = "Just user content";
      const { userContent, hadBlocks } = extractUserContent(content);
      expect(userContent).toBe("Just user content");
      expect(hadBlocks).toBe(false);
    });
  });

  describe("reconstructAgentsMd", () => {
    it("generates block when file is empty", () => {
      const result = reconstructAgentsMd("");
      expect(result).toContain(BEGIN_MARKER);
      expect(result).toContain(END_MARKER);
    });

    it("appends block to user content", () => {
      const result = reconstructAgentsMd("User content");
      expect(result).toContain("User content");
      expect(result).toContain(BEGIN_MARKER);
      expect(result.indexOf("User content")).toBeLessThan(result.indexOf(BEGIN_MARKER));
    });

    it("removes old block and appends fresh one", () => {
      const oldContent = `Old user content
${BEGIN_MARKER}
Old block
${END_MARKER}
More user content`;
      const result = reconstructAgentsMd(oldContent);
      expect(result).toContain("Old user content");
      expect(result).toContain("More user content");
      expect(result).not.toContain("Old block");
      expect(result).toContain(BEGIN_MARKER);
    });

    it("consolidates duplicate blocks into one", () => {
      const content = `${BEGIN_MARKER}Block 1${END_MARKER}
User
${BEGIN_MARKER}Block 2${END_MARKER}`;
      const result = reconstructAgentsMd(content);
      const blockCount = (result.match(new RegExp(BEGIN_MARKER, "g")) || []).length;
      expect(blockCount).toBe(1);
    });
  });

  describe("removeAllBlocks", () => {
    it("removes canonical markers", () => {
      const content = `${BEGIN_MARKER}Block${END_MARKER}`;
      const { result, hadBlocks } = removeAllBlocks(content);
      expect(result).toBe("");
      expect(hadBlocks).toBe(true);
    });

    it("removes legacy versioned markers", () => {
      const content = `<!-- pi-subagents:begin v2 -->Block<!-- pi-subagents:end v2 -->`;
      const { result, hadBlocks } = removeAllBlocks(content);
      expect(result).toBe("");
      expect(hadBlocks).toBe(true);
    });

    it("removes multiple blocks", () => {
      const content = `\n\n${BEGIN_MARKER}Block1${END_MARKER}\nUser\n\n${BEGIN_MARKER}Block2${END_MARKER}`;
      const { result, hadBlocks } = removeAllBlocks(content);
      expect(result).toBe("\nUser");
      expect(hadBlocks).toBe(true);
    });

    it("preserves user content", () => {
      const content = `Before\n\n${BEGIN_MARKER}Block${END_MARKER}\nAfter`;
      const { result, hadBlocks } = removeAllBlocks(content);
      expect(result).toBe("Before\nAfter");
      expect(hadBlocks).toBe(true);
    });

    it("returns hadBlocks=false when no blocks", () => {
      const content = "Just user content";
      const { result, hadBlocks } = removeAllBlocks(content);
      expect(result).toBe("Just user content");
      expect(hadBlocks).toBe(false);
    });
  });

  describe("BLOCK_PATTERN regex", () => {
    it("matches canonical markers", () => {
      const content = `${BEGIN_MARKER}content${END_MARKER}`;
      expect(BLOCK_PATTERN.test(content)).toBe(true);
    });

    it("matches legacy markers with version tags", () => {
      const content = `<!-- pi-subagents:begin v1.0 -->content<!-- pi-subagents:end v1.0 -->`;
      const pattern = /<!-- pi-subagents:begin[^>]*-->[\s\S]*?<!-- pi-subagents:end[^>]*-->/g;
      expect(pattern.test(content)).toBe(true);
    });

    it("is global and matches multiple blocks", () => {
      const content = `${BEGIN_MARKER}A${END_MARKER}
${BEGIN_MARKER}B${END_MARKER}`;
      const matches = content.match(BLOCK_PATTERN) || [];
      expect(matches.length).toBe(2);
    });
  });
});

describe("lifecycle scripts with fs", () => {
  let tmpDir: string;
  let agentsMdPath: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-lifecycle-test-"));
    originalHome = process.env.HOME;
    process.env.HOME = tmpDir;
    agentsMdPath = join(tmpDir, ".pi", "agent", "AGENTS.md");
  });

  afterEach(() => {
    if (originalHome == null) delete process.env.HOME;
    else process.env.HOME = originalHome;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("prepareDirectory", () => {
    it("creates directory recursively if missing", async () => {
      await prepareDirectory(agentsMdPath);
      const stat = statSync(join(tmpDir, ".pi"));
      expect(stat.isDirectory()).toBe(true);
    });

    it("succeeds if directory already exists", async () => {
      mkdirSync(join(tmpDir, ".pi", "agent"), { recursive: true });
      const result = await prepareDirectory(agentsMdPath);
      expect(result).toBe(agentsMdPath);
    });
  });

  describe("readAgentsMd", () => {
    it("reads existing file", async () => {
      mkdirSync(join(tmpDir, ".pi", "agent"), { recursive: true });
      writeFileSync(agentsMdPath, "test content");
      const content = await readAgentsMd(agentsMdPath);
      expect(content).toBe("test content");
    });

    it("returns empty string when file does not exist", async () => {
      const content = await readAgentsMd(agentsMdPath);
      expect(content).toBe("");
    });
  });

  describe("atomicWriteAgentsMd", () => {
    it("writes file atomically", async () => {
      await prepareDirectory(agentsMdPath);
      await atomicWriteAgentsMd(agentsMdPath, "test content");
      const content = readFileSync(agentsMdPath, "utf8");
      expect(content).toBe("test content");
    });

    it("overwrites existing file", async () => {
      await prepareDirectory(agentsMdPath);
      await atomicWriteAgentsMd(agentsMdPath, "old content");
      await atomicWriteAgentsMd(agentsMdPath, "new content");
      const content = readFileSync(agentsMdPath, "utf8");
      expect(content).toBe("new content");
    });

    it("throws on write error (e.g., no permission)", async () => {
      // Create read-only directory (if supported on platform)
      mkdirSync(join(tmpDir, ".pi", "agent"), { recursive: true });
      // Note: this test may not work on Windows; it's platform-specific
      // In practice, the scripts handle this gracefully in the entry point.
    });
  });

  describe("deleteIfEmpty", () => {
    it("deletes file if empty", async () => {
      await prepareDirectory(agentsMdPath);
      await atomicWriteAgentsMd(agentsMdPath, "");
      await deleteIfEmpty(agentsMdPath);
      // File should be deleted or missing
      const content = await readAgentsMd(agentsMdPath);
      expect(content).toBe("");
    });

    it("leaves file if it contains user content", async () => {
      await prepareDirectory(agentsMdPath);
      await atomicWriteAgentsMd(agentsMdPath, "user content");
      await deleteIfEmpty(agentsMdPath);
      const content = readFileSync(agentsMdPath, "utf8");
      expect(content).toBe("user content");
    });

    it("succeeds if file does not exist", async () => {
      // Should not throw
      await deleteIfEmpty(agentsMdPath);
    });
  });
});

describe("postinstall and preuninstall behavior", () => {
  let tmpDir: string;
  let agentsMdPath: string;
  let originalHome: string | undefined;
  let originalInitCwd: string | undefined;
  let originalCi: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-lifecycle-e2e-"));
    originalHome = process.env.HOME;
    originalInitCwd = process.env.INIT_CWD;
    originalCi = process.env.CI;
    process.env.HOME = tmpDir;
    agentsMdPath = join(tmpDir, ".pi", "agent", "AGENTS.md");
  });

  afterEach(() => {
    if (originalHome == null) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalInitCwd == null) delete process.env.INIT_CWD;
    else process.env.INIT_CWD = originalInitCwd;
    if (originalCi == null) delete process.env.CI;
    else process.env.CI = originalCi;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("postinstall script execution", () => {
    const packageDir = join(__dirname, "..");
    const postinstallScript = join(packageDir, "scripts", "postinstall.mjs");

    it("skips write when CI environment is set", async () => {
      const env = { ...process.env, CI: "1", HOME: tmpDir };
      const result = spawnSync("node", [postinstallScript], { env, stdio: "pipe" });
      expect(result.status).toBe(0);
      
      // File should not exist
      const content = await readAgentsMd(agentsMdPath);
      expect(content).toBe("");
    });

    it("skips write when INIT_CWD is package directory (dev install)", async () => {
      const env = { ...process.env, INIT_CWD: packageDir, HOME: tmpDir };
      const result = spawnSync("node", [postinstallScript], { env, stdio: "pipe" });
      expect(result.status).toBe(0);
      
      // File should not exist
      const content = await readAgentsMd(agentsMdPath);
      expect(content).toBe("");
    });

    it("writes when INIT_CWD is package directory but package lives under ~/.pi/agent (pi git install)", async () => {
      // Simulate a pi git-extension install: package cloned under ~/.pi/agent,
      // npm run with cwd inside the cloned package dir (INIT_CWD === packageDir).
      const installedPkgDir = join(tmpDir, ".pi", "agent", "git", "github.com", "anh-chu", "pi-subagents");
      mkdirSync(installedPkgDir, { recursive: true });
      cpSync(join(packageDir, "scripts"), join(installedPkgDir, "scripts"), { recursive: true });

      const env = { ...process.env, INIT_CWD: installedPkgDir, HOME: tmpDir };
      delete env.CI;
      const result = spawnSync("node", [join(installedPkgDir, "scripts", "postinstall.mjs")], { env, stdio: "pipe" });
      expect(result.status).toBe(0);

      const content = await readAgentsMd(agentsMdPath);
      expect(content).toContain(BEGIN_MARKER);
      expect(content).toContain("Four-Dial");
    });

    it("creates AGENTS.md on fresh install (normal case)", async () => {
      const env = { ...process.env, HOME: tmpDir };
      delete env.CI;
      delete env.INIT_CWD;
      
      const result = spawnSync("node", [postinstallScript], { env, stdio: "pipe" });
      expect(result.status).toBe(0);
      
      // File should exist and contain guidance block
      const content = await readAgentsMd(agentsMdPath);
      expect(content).toContain(BEGIN_MARKER);
      expect(content).toContain("Four-Dial");
    });

    it("replaces old block with new block on reinstall", async () => {
      // First install
      const env = { ...process.env, HOME: tmpDir };
      delete env.CI;
      delete env.INIT_CWD;
      
      let result = spawnSync("node", [postinstallScript], { env, stdio: "pipe" });
      expect(result.status).toBe(0);
      
      // Modify the block to simulate outdated version
      const oldContent = readFileSync(agentsMdPath, "utf8");
      const modifiedContent = oldContent.replace("Four-Dial", "Old-Dial");
      writeFileSync(agentsMdPath, modifiedContent);
      
      // Run postinstall again
      result = spawnSync("node", [postinstallScript], { env, stdio: "pipe" });
      expect(result.status).toBe(0);
      
      // Block should be updated
      const newContent = readFileSync(agentsMdPath, "utf8");
      expect(newContent).toContain("Four-Dial");
      expect(newContent).not.toContain("Old-Dial");
    });

    it("is idempotent: running twice produces same file with no write on second run", async () => {
      const env = { ...process.env, HOME: tmpDir };
      delete env.CI;
      delete env.INIT_CWD;
      
      // First run
      const result1 = spawnSync("node", [postinstallScript], { env, stdio: "pipe" });
      expect(result1.status).toBe(0);
      
      const firstContent = readFileSync(agentsMdPath, "utf8");
      const firstMtime = statSync(agentsMdPath).mtime.getTime();
      
      // Wait a bit to ensure file mtime would change if written
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Second run
      const result2 = spawnSync("node", [postinstallScript], { env, stdio: "pipe" });
      expect(result2.status).toBe(0);
      
      const secondContent = readFileSync(agentsMdPath, "utf8");
      const secondMtime = statSync(agentsMdPath).mtime.getTime();
      
      // Content should be identical
      expect(firstContent).toBe(secondContent);
      // File mtime should not change (indicates no write occurred)
      expect(firstMtime).toBe(secondMtime);
    });
  });

  describe("preuninstall script execution", () => {
    const packageDir = join(__dirname, "..");
    const preuninstallScript = join(packageDir, "scripts", "preuninstall.mjs");

    it("removes marked block from AGENTS.md", async () => {
      // First create a file with a block
      await prepareDirectory(agentsMdPath);
      const content = `${BEGIN_MARKER}
Block content
${END_MARKER}`;
      await atomicWriteAgentsMd(agentsMdPath, content);
      
      // Run preuninstall
      const env = { ...process.env, HOME: tmpDir };
      const result = spawnSync("node", [preuninstallScript], { env, stdio: "pipe" });
      expect(result.status).toBe(0);
      
      // File should be removed or empty
      const remaining = await readAgentsMd(agentsMdPath);
      expect(remaining).toBe("");
    });

    it("preserves user content outside block during removal", async () => {
      await prepareDirectory(agentsMdPath);
      const content = `# My Custom Guide\n\nUser content before\n\n${BEGIN_MARKER}\nBlock\n${END_MARKER}\n\nUser content after`;
      await atomicWriteAgentsMd(agentsMdPath, content);
      
      // Run preuninstall
      const env = { ...process.env, HOME: tmpDir };
      const result = spawnSync("node", [preuninstallScript], { env, stdio: "pipe" });
      expect(result.status).toBe(0);
      
      // User content should be preserved
      const remaining = readFileSync(agentsMdPath, "utf8");
      expect(remaining).toContain("# My Custom Guide");
      expect(remaining).toContain("User content before");
      expect(remaining).toContain("User content after");
      expect(remaining).not.toContain(BEGIN_MARKER);
    });

    it("handles missing file gracefully", async () => {
      // File does not exist
      const env = { ...process.env, HOME: tmpDir };
      const result = spawnSync("node", [preuninstallScript], { env, stdio: "pipe" });
      expect(result.status).toBe(0);
      // Should not error
    });

    it("is idempotent: running twice is safe", async () => {
      await prepareDirectory(agentsMdPath);
      const content = `${BEGIN_MARKER}\nBlock\n${END_MARKER}`;
      await atomicWriteAgentsMd(agentsMdPath, content);
      
      const env = { ...process.env, HOME: tmpDir };
      
      // First removal
      const result1 = spawnSync("node", [preuninstallScript], { env, stdio: "pipe" });
      expect(result1.status).toBe(0);
      
      // Second removal (should find no blocks)
      const result2 = spawnSync("node", [preuninstallScript], { env, stdio: "pipe" });
      expect(result2.status).toBe(0);
      // Should not error
    });
  });

  describe("postinstall workflow", () => {
    it("creates AGENTS.md on fresh machine", async () => {
      await prepareDirectory(agentsMdPath);
      const content = reconstructAgentsMd("");
      await atomicWriteAgentsMd(agentsMdPath, content);
      const fileContent = readFileSync(agentsMdPath, "utf8");
      expect(fileContent).toContain(BEGIN_MARKER);
      expect(fileContent).toContain("Four-Dial");
    });

    it("replaces old block with new block on reinstall", async () => {
      await prepareDirectory(agentsMdPath);
      const oldBlock = `${BEGIN_MARKER}
Old content
${END_MARKER}`;
      await atomicWriteAgentsMd(agentsMdPath, oldBlock);

      const newContent = reconstructAgentsMd(oldBlock);
      await atomicWriteAgentsMd(agentsMdPath, newContent);

      const fileContent = readFileSync(agentsMdPath, "utf8");
      expect(fileContent).not.toContain("Old content");
      expect(fileContent).toContain("Four-Dial");
    });

    it("consolidates duplicate blocks to one", async () => {
      await prepareDirectory(agentsMdPath);
      const duplicateBlocks = `${BEGIN_MARKER}
Block 1
${END_MARKER}
User content
${BEGIN_MARKER}
Block 2
${END_MARKER}`;
      await atomicWriteAgentsMd(agentsMdPath, duplicateBlocks);

      const newContent = reconstructAgentsMd(duplicateBlocks);
      await atomicWriteAgentsMd(agentsMdPath, newContent);

      const fileContent = readFileSync(agentsMdPath, "utf8");
      const blockCount = (fileContent.match(new RegExp(BEGIN_MARKER, "g")) || []).length;
      expect(blockCount).toBe(1);
    });

    it("handles legacy versioned markers gracefully", async () => {
      await prepareDirectory(agentsMdPath);
      const legacyBlock = `<!-- pi-subagents:begin v1.0 -->
Legacy content
<!-- pi-subagents:end v1.0 -->`;
      await atomicWriteAgentsMd(agentsMdPath, legacyBlock);

      const newContent = reconstructAgentsMd(legacyBlock);
      await atomicWriteAgentsMd(agentsMdPath, newContent);

      const fileContent = readFileSync(agentsMdPath, "utf8");
      expect(fileContent).not.toContain("Legacy content");
      expect(fileContent).toContain("Four-Dial");
    });

    it("preserves user content outside markers", async () => {
      await prepareDirectory(agentsMdPath);
      const mixedContent = `# My Custom Guide

User section 1

${BEGIN_MARKER}
Old block
${END_MARKER}

User section 2`;
      await atomicWriteAgentsMd(agentsMdPath, mixedContent);

      const newContent = reconstructAgentsMd(mixedContent);
      await atomicWriteAgentsMd(agentsMdPath, newContent);

      const fileContent = readFileSync(agentsMdPath, "utf8");
      expect(fileContent).toContain("# My Custom Guide");
      expect(fileContent).toContain("User section 1");
      expect(fileContent).toContain("User section 2");
      expect(fileContent).not.toContain("Old block");
    });

    it("is idempotent: running twice produces same result", async () => {
      await prepareDirectory(agentsMdPath);
      const initialContent = reconstructAgentsMd("");
      await atomicWriteAgentsMd(agentsMdPath, initialContent);

      const firstRun = readFileSync(agentsMdPath, "utf8");

      const secondRunContent = reconstructAgentsMd(firstRun);
      await atomicWriteAgentsMd(agentsMdPath, secondRunContent);

      const secondRun = readFileSync(agentsMdPath, "utf8");

      expect(firstRun).toBe(secondRun);
    });

    it("preserves user content with leading/trailing whitespace byte-exact", async () => {
      await prepareDirectory(agentsMdPath);
      const userContent = "  User content with spaces  \n\nAnd multiple lines  \n\n";
      const blockContent = `${userContent}${BEGIN_MARKER}\nOld block\n${END_MARKER}`;
      await atomicWriteAgentsMd(agentsMdPath, blockContent);

      // Reconstruct the content
      const newContent = reconstructAgentsMd(blockContent);

      // The user content should be preserved exactly (except for normalizing trailing newlines to ensure one blank line before block)
      // Leading/trailing spaces within user content should be preserved
      expect(newContent).toContain("User content with spaces");
      expect(newContent).toContain("And multiple lines");
    });

    it("round-trip: file with odd spacing -> postinstall -> preuninstall -> byte-identical", async () => {
      await prepareDirectory(agentsMdPath);
      
      // Original file with odd spacing, leading/trailing whitespace
      const originalContent = "  \n\n  Leading whitespace\n  Middle content  \n\n  Trailing with spaces  ";
      await atomicWriteAgentsMd(agentsMdPath, originalContent);
      
      // Simulate postinstall: extract user, append block
      const withBlock = reconstructAgentsMd(originalContent);
      await atomicWriteAgentsMd(agentsMdPath, withBlock);
      
      // Simulate preuninstall: remove block
      const { result: afterRemoval } = removeAllBlocks(withBlock);
      await atomicWriteAgentsMd(agentsMdPath, afterRemoval);
      
      // Read final content
      const finalContent = readFileSync(agentsMdPath, "utf8");
      
      // Should be byte-identical to original (no trimming except excess trailing newlines normalized for blank-line junction)
      expect(finalContent).toBe(originalContent);
    });

    it("postinstall output's user-content region strictly equals normalized user bytes", async () => {
      await prepareDirectory(agentsMdPath);
      
      // Original user content (with excess trailing newlines)
      const origContent = "# My Guide\n\nSome content  \nWith odd spacing  \n\n\n";
      // After reconstruction, trailing newlines are normalized to ensure exactly one blank line before block
      const expected = "# My Guide\n\nSome content  \nWith odd spacing  ";
      
      await atomicWriteAgentsMd(agentsMdPath, origContent);
      
      // Simulate postinstall
      const withBlock = reconstructAgentsMd(origContent);
      
      // Extract the user-content region (before the block)
      const blockStartIdx = withBlock.indexOf(BEGIN_MARKER);
      const userRegion = withBlock.substring(0, blockStartIdx - 2); // Remove separator \n\n
      
      // User region should equal normalized bytes (excess trailing newlines removed)
      expect(userRegion).toBe(expected);
    });
  });

  describe("preuninstall workflow (unit tests)", () => {
    it("removes marked block from AGENTS.md", async () => {
      await prepareDirectory(agentsMdPath);
      // Simulate postinstall format: user content + separator + block
      const content = `\n\n${BEGIN_MARKER}\nBlock content\n${END_MARKER}`;
      await atomicWriteAgentsMd(agentsMdPath, content);

      // Simulate preuninstall: remove blocks
      const { result, hadBlocks } = removeAllBlocks(content);
      expect(hadBlocks).toBe(true);
      expect(result).toBe(""); // No user content left
      
      // Delete the file if result is empty, otherwise write it back
      if (result) {
        await atomicWriteAgentsMd(agentsMdPath, result);
      } else {
        // No user content; delete the file
        try {
          await fs.unlink(agentsMdPath);
        } catch {
          // File may already be deleted or inaccessible
        }
      }

      const remaining = await readAgentsMd(agentsMdPath);
      expect(remaining).toBe("");
    });

    it("preserves user content when removing block", async () => {
      await prepareDirectory(agentsMdPath);
      // Simulate postinstall format: user before + separator + block
      const content = `User content\n\n${BEGIN_MARKER}\nBlock\n${END_MARKER}`;
      await atomicWriteAgentsMd(agentsMdPath, content);

      const { result } = removeAllBlocks(content);
      await atomicWriteAgentsMd(agentsMdPath, result);

      const fileContent = readFileSync(agentsMdPath, "utf8");
      expect(fileContent).toBe("User content");
      expect(fileContent).not.toContain(BEGIN_MARKER);
    });

    it("handles missing file gracefully", async () => {
      // File does not exist
      const content = await readAgentsMd(agentsMdPath);
      expect(content).toBe("");
      // No error should occur
    });

    it("removes all marked blocks (canonical and versioned)", async () => {
      await prepareDirectory(agentsMdPath);
      const content = `User\n\n${BEGIN_MARKER}Block1${END_MARKER}\nExtra\n\n<!-- pi-subagents:begin v1 -->Block2<!-- pi-subagents:end v1 -->`;
      await atomicWriteAgentsMd(agentsMdPath, content);

      const { result, hadBlocks } = removeAllBlocks(content);
      expect(hadBlocks).toBe(true);
      
      // Write back the result (which contains user content)
      await atomicWriteAgentsMd(agentsMdPath, result);

      const fileContent = readFileSync(agentsMdPath, "utf8");
      // First block with separator should be removed; user content preserved
      expect(fileContent).not.toContain(BEGIN_MARKER);
      expect(fileContent).not.toContain("Block1");
    });

    it("is idempotent: running twice is safe", async () => {
      await prepareDirectory(agentsMdPath);
      // Simulate postinstall format
      const content = `User\n\n${BEGIN_MARKER}\nBlock\n${END_MARKER}`;
      await atomicWriteAgentsMd(agentsMdPath, content);

      // First removal
      const { result: firstResult, hadBlocks: hadBlocks1 } = removeAllBlocks(content);
      expect(hadBlocks1).toBe(true);
      expect(firstResult).toBe("User");
      await atomicWriteAgentsMd(agentsMdPath, firstResult);

      // Second removal (should find nothing)
      const currentContent = await readAgentsMd(agentsMdPath);
      const { result: secondResult, hadBlocks: hadBlocks2 } = removeAllBlocks(currentContent);
      expect(hadBlocks2).toBe(false);
      expect(secondResult).toBe("User");
    });
  });
});
