import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const readyRouter = Router();

// Unlike /health (process is up), /ready checks the dependency Cloud Run
// actually needs to serve traffic: can we reach the database.
readyRouter.get("/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "not ready" });
  }
});
