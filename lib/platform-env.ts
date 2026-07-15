export type HarborPlatformEnv = {
  DB?: D1Database;
  BUCKET?: R2Bucket;
};

declare global {
  var __HARBOR_PLATFORM_ENV__: HarborPlatformEnv | undefined;
}

export function setPlatformEnv(env: HarborPlatformEnv): void {
  globalThis.__HARBOR_PLATFORM_ENV__ = env;
}

export function getPlatformEnv(): HarborPlatformEnv {
  const env = globalThis.__HARBOR_PLATFORM_ENV__;
  if (!env) {
    throw new Error("Project Harbor platform bindings are unavailable");
  }
  return env;
}
