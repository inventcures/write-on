# Alternative groups do not nest; flattening sends inner variants to Overflow

As in both open-source clones, groups are flat in Phase 0. Making a group over text that already contains groups flattens them: each inner group's active variant becomes ordinary text in the new group's first variant. Unlike the clones, which drop the inner groups' other variants, we append them to Overflow with a short note of which words they came from, because "nothing is ever lost" is a core principle. Nesting stays a Phase 2 option.
