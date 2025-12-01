import * as functions from "firebase-functions";
import express from "express";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./backend/src/app.module";  // << เส้นนี้สำคัญ ต้องตรง folder!

const server = express();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  await app.init();

  server.use(app.getHttpAdapter().getInstance());
}

bootstrap();

export const api = functions.https.onRequest(server);
