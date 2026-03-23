export function createPublishEnv() {
  const env = { ...process.env };
  delete env.npm_config_recursive;

  for (const key of Object.keys(env)) {
    const normalized = key.toLowerCase();
    if (normalized.includes("stackcanon") && normalized.includes("registry")) {
      delete env[key];
    }
  }

  return env;
}
