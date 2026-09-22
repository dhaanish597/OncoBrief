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
export * from './vocab/fact-value';
export * from './vocab/fact-types';
export * from './vocab/document-types';
export * from './vocab/task-kinds';

// evidence
export * from './evidence/state';
export * from './evidence/transitions';

// provenance
export * from './provenance/normalize';
export * from './provenance/span-validation';

// ledger
export * from './ledger/canonical-json';
export * from './ledger/hash-chain';

// conflict
export * from './conflict/comparators';
export * from './conflict/detector';

// twin
export * from './twin/gaps';
export * from './twin/readiness';

// packet
export * from './packet/assemble';

// messages
export * from './messages/render';

// tasks
export * from './tasks/task-machine';

// policy
export * from './policy/rbac';
export * from './policy/clinical-boundary';
