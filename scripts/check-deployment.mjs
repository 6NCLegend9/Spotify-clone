import nextEnv from "@next/env";
import { validateDeploymentConfig } from "../src/utils/deploymentConfig.mjs";

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { errors, warnings } = validateDeploymentConfig(process.env);
for (const warning of warnings) console.warn(`WARNING: ${warning}`);
for (const error of errors) console.error(`ERROR: ${error}`);
if (errors.length) process.exitCode = 1;
else console.log("Deployment configuration checks passed. Service connectivity is not tested.");