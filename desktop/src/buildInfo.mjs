import { createRequire } from "node:module";
import { normalizeStoredUpdateChannel } from "./updateChannel.mjs";

const require = createRequire(import.meta.url);
const packageMetadata = require("../package.json");

export const DESKTOP_BUILD_CHANNEL = normalizeStoredUpdateChannel(
  packageMetadata?.heykasaReleaseChannel,
);
