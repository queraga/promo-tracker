const isSqliteBusy = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? String(error.code) : "";
  return ["P1008", "SQLITE_BUSY", "SQLITE_LOCKED"].includes(code)
    || /database is (?:locked|busy)|SQLITE_(?:BUSY|LOCKED)/i.test(error.message);
};

export async function withSqliteBusyRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts || !isSqliteBusy(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 10));
    }
  }
}
