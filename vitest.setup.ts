// Loads .env into process.env for tests (e.g. DATABASE_URL for integration tests).
// Uses Node's built-in env-file loader (Node 20.12+/21.7+), so no dotenv dependency.
// Missing .env is fine — integration tests then skip on an unreachable DB.
try {
  (process as NodeJS.Process & { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env");
} catch {
  // no .env present — integration tests will skip
}
