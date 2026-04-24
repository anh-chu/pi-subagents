# Project Context

This is a typescript project using raw-http.


High-impact files (most imported, changes here affect many other files):
- src/types.ts (imported by 17 files)
- src/parent-bridge.ts (imported by 6 files)
- src/agent-runner.ts (imported by 5 files)
- src/agent-types.ts (imported by 5 files)
- src/index.ts (imported by 5 files)
- src/agent-manager.ts (imported by 4 files)
- src/context.ts (imported by 2 files)
- src/env.ts (imported by 2 files)

Required environment variables (no defaults):
- HOME (test/custom-agents.test.ts)

Read .codesight/wiki/index.md for orientation (WHERE things live). Then read actual source files before implementing. Wiki articles are navigation aids, not implementation guides.
Read .codesight/CODESIGHT.md for the complete AI context map including all routes, schema, components, libraries, config, middleware, and dependency graph.
