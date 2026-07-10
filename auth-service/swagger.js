import swaggerJsdoc from "swagger-jsdoc";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "APPVideo Auth API",
      version: "1.0.0",
      description: "Serviço de autenticação"
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT"
        }
      }
    }
  },
  apis: ["./src/**/*.js"]
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;