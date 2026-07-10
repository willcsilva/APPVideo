import app from "./app.js";
import { config } from "./config.js";

import swaggerUi from "swagger-ui-express";
import swaggerSpec from "../swagger.js";

app.use("/api-docs", swaggerUi.serve);

app.get(
  "/api-docs",
  swaggerUi.setup(swaggerSpec, {
    explorer: true,
  })
);

app.listen(config.port, () => {
  console.log(`Auth service rodando na porta ${config.port}`);
});