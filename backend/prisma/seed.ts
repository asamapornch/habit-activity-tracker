import path from "node:path";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(import.meta.dirname, "../../.env") });

const prisma = new PrismaClient();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name} for seeding`);
  }
  return value;
}

async function main() {
  const managerPassword = requireEnv("SEED_PASSWORD_MANAGER");
  const participant1Password = requireEnv("SEED_PASSWORD_PARTICIPANT_1");
  const participant2Password = requireEnv("SEED_PASSWORD_PARTICIPANT_2");

  await prisma.user.upsert({
    where: { email: "manager@example.com" },
    update: {},
    create: {
      email: "manager@example.com",
      passwordHash: await bcrypt.hash(managerPassword, 10),
      role: "MANAGER",
    },
  });

  await prisma.user.upsert({
    where: { email: "participant1@example.com" },
    update: {},
    create: {
      email: "participant1@example.com",
      passwordHash: await bcrypt.hash(participant1Password, 10),
      role: "PARTICIPANT",
    },
  });

  await prisma.user.upsert({
    where: { email: "participant2@example.com" },
    update: {},
    create: {
      email: "participant2@example.com",
      passwordHash: await bcrypt.hash(participant2Password, 10),
      role: "PARTICIPANT",
    },
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
