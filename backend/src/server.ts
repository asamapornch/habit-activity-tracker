import { createApp } from "./app.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { config } from "./lib/config.js";

const app = createApp();
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Backend listening on port ${config.port}`);
});
