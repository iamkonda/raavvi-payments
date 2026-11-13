
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";
import { AdminRole } from "../src/generated/prisma/enums";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is missing from .env");
  }

  const adapter = new PrismaNeon({ connectionString });
  const prisma = new PrismaClient({ adapter });

  const rl = createInterface({ input: stdin, output: stdout });

  try {
    const name = (await rl.question("Admin full name: ")).trim();
    const email = (await rl.question("Admin email: ")).trim().toLowerCase();
    const password = await rl.question("Admin password (minimum 12 characters): ");

    if (!name || !email || password.length < 12) {
      throw new Error("Enter a name, valid email and password of at least 12 characters.");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const admin = await prisma.adminUser.upsert({
      where: { email },
      update: {
        name,
        passwordHash,
        role: AdminRole.SUPER_ADMIN,
        isActive: true,
      },
      create: {
        name,
        email,
        passwordHash,
        role: AdminRole.SUPER_ADMIN,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    console.log("\nAdministrator created successfully:");
    console.log(admin);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Admin setup failed:", error);
  process.exitCode = 1;
});
