# Pattern selection

Choose from data dependencies, then read only the matching example. TypeScript owns enumeration, identity, ordering, deduplication, bounds, stopping, brackets, and failure ledgers. Agents own semantic work.

| Dependency shape | Pattern | Preserve when adapting | Example |
| --- | --- | --- | --- |
| Heterogeneous items need different handling | Classify and act | Finish all classification before routed action; ledger classification and action failures by item ID | [Adapt](../examples/classify-and-act.ts) |
| Independent work needs whole-set judgment | Fan out and synthesize | Await the full set; give synthesis every intended ID, including failures | [Adapt](../examples/fan-out-and-synthesize.ts) |
| Claims need skeptical checks | Adversarial verification | Use separate producer and skeptic calls; start skepticism only after production; ledger both failure kinds | [Adapt](../examples/adversarial-verification.ts) |
| Exploration should diverge before one rubric | Generate and filter | Finish generation; deterministically deduplicate and bound candidates before filter calls | [Adapt](../examples/generate-and-filter.ts) |
| Pairwise comparison beats absolute scoring | Tournament | Let TypeScript run the bounded bracket and byes; agents compare one pair; ledger match failures | [Adapt](../examples/tournament.ts) |
| Work cardinality is unknown | Loop until done | Deduplicate by stable key; count only successful empty rounds as dry; cap rounds; retain failed rounds in the ledger | [Adapt](../examples/loop-until-done.ts) |

For every pattern: validate and bound input before fan-out, use stable IDs and unique agent names, preserve missing coverage, and return plain JSON data. Combine patterns only when the task has both dependency shapes. Direct work needs no orchestration.
