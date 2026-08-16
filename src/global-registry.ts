import type { AgentRecord } from "./types.js";
import type { AgentActivity } from "./ui/agent-widget.js";

const REGISTRY = Symbol.for("pi-subagents:registry");

type Registry = {
  records: Map<string, AgentRecord>;
  activity: Map<string, AgentActivity>;
};

function registry(): Registry {
  const g = globalThis as any;
  const existing = g[REGISTRY] as Registry | undefined;
  if (existing) return existing;
  const created: Registry = {
    records: new Map(),
    activity: new Map(),
  };
  g[REGISTRY] = created;
  return created;
}

export function registerRecord(record: AgentRecord): void {
  registry().records.set(record.id, record);
}

function hasRunningAncestor(record: AgentRecord, records: Map<string, AgentRecord>): boolean {
  const visited = new Set<string>([record.id]);
  let parentId = record.parentId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = records.get(parentId);
    if (!parent) return false;
    if (parent.status === "running" || parent.status === "queued") return true;
    parentId = parent.parentId;
  }
  return false;
}

export function unregisterRecord(id: string): void {
  const reg = registry();
  const record = reg.records.get(id);
  // Keep terminal descendants discoverable until their active ancestor settles.
  if (record && hasRunningAncestor(record, reg.records)) {
    reg.activity.delete(id);
    return;
  }
  reg.records.delete(id);
  reg.activity.delete(id);
}

/** Remove terminal descendants after their parent has incorporated their summary. */
export function pruneSettledDescendants(parentId: string): void {
  const reg = registry();
  const children = new Map<string, AgentRecord[]>();
  for (const record of reg.records.values()) {
    if (!record.parentId) continue;
    const siblings = children.get(record.parentId) ?? [];
    siblings.push(record);
    children.set(record.parentId, siblings);
  }

  const visited = new Set<string>([parentId]);
  const descendants: AgentRecord[] = [];
  const visit = (id: string) => {
    for (const child of children.get(id) ?? []) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      descendants.push(child);
      visit(child.id);
    }
  };
  visit(parentId);

  for (const record of descendants) {
    if (record.status === "running" || record.status === "queued") continue;
    if (hasRunningAncestor(record, reg.records)) continue;
    reg.records.delete(record.id);
    reg.activity.delete(record.id);
  }
}

export function listGlobalRecords(): AgentRecord[] {
  return [...registry().records.values()].sort((a, b) => b.startedAt - a.startedAt);
}

export function setGlobalActivity(id: string, activity: AgentActivity): void {
  registry().activity.set(id, activity);
}

export function getGlobalActivity(id: string): AgentActivity | undefined {
  return registry().activity.get(id);
}

export function deleteGlobalActivity(id: string): void {
  registry().activity.delete(id);
}
