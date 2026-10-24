import { afterEach, describe, expect, it, vi } from "vitest";

const { connect, query, release } = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
}));
vi.mock("../src/client", () => ({ getMigratorPool: () => ({ connect }) }));
import { seed } from "../src/seed";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
function environment() {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("ONCOBRIEF_DEMO_MODE", "true");
  vi.stubEnv("DEMO_DATABASE_NAME", "oncobrief_audit_test");
  vi.stubEnv(
    "DATABASE_URL",
    "postgres://app:pw@localhost:5432/oncobrief_audit_test",
  );
  vi.stubEnv(
    "DATABASE_MIGRATOR_URL",
    "postgres://postgres:pw@127.0.0.1:5432/oncobrief_audit_test",
  );
  connect.mockResolvedValue({ query, release });
}

describe("destructive demo seed safety", () => {
  it("rejects production before opening a database connection", async () => {
    environment();
    vi.stubEnv("NODE_ENV", "production");
    await expect(seed()).rejects.toThrow("demo_reset_requires_development");
    expect(connect).not.toHaveBeenCalled();
  });
  it("rejects remote databases before opening a connection", async () => {
    environment();
    vi.stubEnv(
      "DATABASE_MIGRATOR_URL",
      "postgres://postgres:pw@hospital.example/oncobrief_audit_test",
    );
    await expect(seed()).rejects.toThrow("demo_reset_requires_loopback");
    expect(connect).not.toHaveBeenCalled();
  });
  it("requires explicit matching app and migrator database targets", async () => {
    environment();
    vi.stubEnv("DATABASE_URL", "postgres://app:pw@localhost/another_database");
    await expect(seed()).rejects.toThrow("demo_reset_database_mismatch");
    expect(connect).not.toHaveBeenCalled();
  });
  it("rejects non-synthetic identities before truncate and rolls back", async () => {
    environment();
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("current_database"))
        return { rows: [{ database_name: "oncobrief_audit_test" }] };
      if (sql.includes("non_synthetic"))
        return { rows: [{ non_synthetic: true }] };
      return { rows: [] };
    });
    await expect(seed()).rejects.toThrow("demo_reset_non_synthetic_data");
    expect(query.mock.calls.some(([sql]) => /^TRUNCATE/.test(sql))).toBe(false);
    expect(query.mock.calls.some(([sql]) => sql === "ROLLBACK")).toBe(true);
    expect(release).toHaveBeenCalled();
  });
});
