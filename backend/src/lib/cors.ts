import cors from "cors";
import { config } from "./config.js";

export function createCorsMiddleware() {
  return cors({
    origin(origin, callback) {
      callback(null, origin === config.frontendOrigin);
    },
    credentials: true,
  });
}
