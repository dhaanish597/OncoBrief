/**
 * @oncobrief/domain — pure domain logic. No I/O, no database, no React.
 *
 * This package is the heart of the system: the evidence state machine, span
 * validation, conflict comparators, checklist/gap evaluation, readiness bands,
 * packet assembly, message gates, RBAC and the clinical-boundary guard. It is
 * what makes the product's rules exhaustively testable without a network.
 *
 * The only Node-specific module is `ledger/hash-chain.js` (it uses
 * `node:crypto`); import it from server code only.
 */

// vocabularies
export * from './vocab/fact-value.js';
export * from './vocab/fact-types.js';
export * from './vocab/document-types.js';
export * from './vocab/task-kinds.js';

// evidence
export * from './evidence/state.js';
export * from './evidence/transitions.js';

// provenance
export * from './provenance/normalize.js';
export * from './provenance/span-validation.js';

// ledger
export * from './ledger/canonical-json.js';
export * from './ledger/hash-chain.js';

// conflict
export * from './conflict/comparators.js';
export * from './conflict/detector.js';

// twin
export * from './twin/gaps.js';
export * from './twin/readiness.js';

// packet
export * from './packet/assemble.js';

// messages
export * from './messages/render.js';

// tasks
export * from './tasks/task-machine.js';

// policy
export * from './policy/rbac.js';
export * from './policy/clinical-boundary.js';
