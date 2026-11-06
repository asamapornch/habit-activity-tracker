import cors from "cors";
import { config } from "./config.js";

if (!config.frontendOrigin) {
  throw new Error("FRONTEND_ORIGIN must be set to a non-empty value before the app can start.");
}

export function createCorsMiddleware() {
  return cors({
    origin(origin, callback) {
      callback(null, origin === config.frontendOrigin);
    },
    credentials: true,
  });
}
