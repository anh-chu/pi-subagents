import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveMemoryDir, ensureMemoryDir, readMemoryIndex, buildMemoryBlock, buildReadOnlyMemoryBlock } from "../src/memory.js";

describe("memory", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-mem-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("resolveMemoryDir", () => {
    it("resolves project scope to .pi/agent-memory/<name>", () => {
      const dir = resolveMemoryDir("auditor", "project", "/workspace");
      expect(dir).toBe("/workspace/.pi/agent-memory/auditor");
    });

    it("resolves local scope to .pi/agent-memory-local/<name>", () => {
      const dir = resolveMemoryDir("auditor", "local", "/workspace");
      expect(dir).toBe("/workspace/.pi/agent-memory-local/auditor");
    });

    it("resolves user scope to ~/.pi/agent-memory/<name>", () => {
      const dir = resolveMemoryDir("auditor", "user", "/workspace");
      expect(dir).toContain(".pi/agent-memory/auditor");
      expect(dir).not.toContain("/workspace");
    });

    it("throws on names with path traversal (..)", () => {
      expect(() => resolveMemoryDir("../../etc/evil", "project", "/workspace")).toThrow("Unsafe agent name");
    });

    it("throws on names with forward slash", () => {
      expect(() => resolveMemoryDir("foo/bar", "project", "/workspace")).toThrow("Unsafe agent name");
    });

    it("throws on names with backslash", () => {
      expect(() => resolveMemoryDir("foo\\bar", "project", "/workspace")).toThrow("Unsafe agent name");
    });

    it("throws on names with null byte", () => {
      expect(() => resolveMemoryDir("foo\0bar", "project", "/workspace")).toThrow("Unsafe agent name");
    });
  });

  describe("ensureMemoryDir", () => {
    it("creates directory if it doesn't exist", () => {
      const dir = join(tmpDir, "agent-memory", "test");
      expect(existsSync(dir)).toBe(false);
      ensureMemoryDir(dir);
      expect(existsSync(dir)).toBe(true);
    });

    it("no-ops if directory already exists", () => {
      const dir = join(tmpDir, "agent-memory", "test");
      mkdirSync(dir, { recursive: true });
      ensureMemoryDir(dir); // should not throw
      expect(existsSync(dir)).toBe(true);
    });
  });

  describe("readMemoryIndex", () => {
    it("returns undefined when MEMORY.md doesn't exist", () => {
      const result = readMemoryIndex(tmpDir);
      expect(result).toBeUndefined();
    });

    it("reads MEMORY.md content", () => {
      writeFileSync(join(tmpDir, "MEMORY.md"), "# Memories\n- Item 1\n- Item 2");
      const result = readMemoryIndex(tmpDir);
      expect(result).toBe("# Memories\n- Item 1\n- Item 2");
    });

    it("truncates content beyond 200 lines", () => {
      const lines = Array.from({ length: 250 }, (_, i) => `Line ${i + 1}`);
      writeFileSync(join(tmpDir, "MEMORY.md"), lines.join("\n"));
      const result = readMemoryIndex(tmpDir)!;
      expect(result).toContain("Line 200");
      expect(result).not.toContain("Line 201");
      expect(result).toContain("truncated at 200 lines");
    });
  });

  describe("buildMemoryBlock", () => {
    it("builds memory block with no existing MEMORY.md", () => {
      const block = buildMemoryBlock("test-agent", "project", tmpDir);
      expect(block).toContain("Agent Memory");
      expect(block).toContain("agent-memory/test-agent");
      expect(block).toContain("No MEMORY.md exists yet");
      expect(block).toContain("Memory Instructions");
    });

    it("builds memory block with existing MEMORY.md", () => {
      const memDir = join(tmpDir, ".pi", "agent-memory", "test-agent");
      mkdirSync(memDir, { recursive: true });
      writeFileSync(join(memDir, "MEMORY.md"), "# Existing\n- recall this");
      const block = buildMemoryBlock("test-agent", "project", tmpDir);
      expect(block).toContain("Existing");
      expect(block).toContain("recall this");
      expect(block).not.toContain("No MEMORY.md exists yet");
    });

    it("creates memory directory if it doesn't exist", () => {
      const memDir = join(tmpDir, ".pi", "agent-memory", "new-agent");
      expect(existsSync(memDir)).toBe(false);
      buildMemoryBlock("new-agent", "project", tmpDir);
      expect(existsSync(memDir)).toBe(true);
    });
  });

  describe("buildReadOnlyMemoryBlock", () => {
    it("returns read-only instructions without write/edit mention", () => {
      const block = buildReadOnlyMemoryBlock("test-agent", "project", tmpDir);
      expect(block).toContain("read-only");
      expect(block).not.toContain("Write");
      expect(block).not.toContain("Edit");
      expect(block).not.toContain("Memory Instructions");
    });

    it("does NOT create the memory directory", () => {
      const memDir = join(tmpDir, ".pi", "agent-memory", "ro-agent");
      expect(existsSync(memDir)).toBe(false);
      buildReadOnlyMemoryBlock("ro-agent", "project", tmpDir);
      expect(existsSync(memDir)).toBe(false);
    });

    it("includes existing MEMORY.md content", () => {
      const memDir = join(tmpDir, ".pi", "agent-memory", "test-agent");
      mkdirSync(memDir, { recursive: true });
      writeFileSync(join(memDir, "MEMORY.md"), "# Existing\n- recall this");
      const block = buildReadOnlyMemoryBlock("test-agent", "project", tmpDir);
      expect(block).toContain("Existing");
      expect(block).toContain("recall this");
    });

    it("returns 'no memory available' when no MEMORY.md exists", () => {
      const block = buildReadOnlyMemoryBlock("test-agent", "project", tmpDir);
      expect(block).toContain("No memory is available yet");
      expect(block).not.toContain("Create one");
    });
  });
});
