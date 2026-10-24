import { afterEach, describe, expect, it, vi } from "vitest";

const { query, release, seed, closePools } = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
  seed: vi.fn(),
  closePools: vi.fn(),
}));
import { main } from "../src/demo-readiness";

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("demo readiness is read only by default", () => {
  it("does not migrate, seed or write when fixtures are absent", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("readiness_failed");
    });
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("version()"))
        return { rows: [{ version: "PostgreSQL 16" }] };
      if (sql.includes("count(*)")) return { rows: [{ count: "0" }] };
      return { rows: [] };
    });
    await expect(
      main([], {
        getMigratorPool: () => ({ connect: async () => ({ query, release }) }),
        closePools,
        seed,
        verifyLedgerChain: async () => ({
          ok: true,
          length: 20,
          firstDivergenceSeq: null,
          reason: null,
        }),
        getOcr: () => ({ constructor: { name: "LocalMultimodalOcrAdapter" } }),
        getExtractor: () => ({ constructor: { name: "RuleBasedExtractor" } }),
      }),
    ).rejects.toThrow("readiness_failed");
    expect(seed).not.toHaveBeenCalled();
    expect(
      query.mock.calls.every(([sql]) =>
        /^(SELECT|BEGIN READ ONLY|COMMIT|ROLLBACK)/.test(sql.trim()),
      ),
    ).toBe(true);
    expect(release).toHaveBeenCalled();
  });
  it('rejects a mixed identity database even when all patient rows are synthetic', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('readiness_failed'); });
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('version()')) return { rows: [{ version: 'PostgreSQL 16' }] };
      if (sql.includes('FROM organization') && sql.includes('IS DISTINCT FROM true')) return { rows: [{ count: '1' }] };
      if (sql.includes('count(*)')) return { rows: [{ count: '0' }] };
      return { rows: [] };
    });
    await expect(main([], {
      getMigratorPool: () => ({ connect: async () => ({ query, release }) }), closePools, seed,
      verifyLedgerChain: async () => ({ ok: true, length: 0, firstDivergenceSeq: null, reason: null }),
      getOcr: () => ({ constructor: { name: 'LocalMultimodalOcrAdapter' } }),
      getExtractor: () => ({ constructor: { name: 'RuleBasedExtractor' } }),
    })).rejects.toThrow('non_synthetic_patients_detected');
    expect(seed).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith('ROLLBACK');
  });

});
