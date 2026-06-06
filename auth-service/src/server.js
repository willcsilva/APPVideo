import app from "./app.js";
import { config } from "./config.js";

app.listen(config.port, () => {
  console.log(`Auth service rodando na porta ${config.port}`);
});