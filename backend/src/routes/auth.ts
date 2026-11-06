import { Router } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma.js";
import { sendError } from "../lib/errors.js";
import { SESSION_COOKIE_NAME } from "../lib/session.js";

export const authRouter = Router();

// Fixed hash compared against on an unknown email so the login response time
// does not reveal which emails exist (see F-01 contract, behaviour #2).
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing-safety", 10);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

authRouter.post("/auth/login", async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};

    if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
      sendError(res, 400, "VALIDATION_ERROR", "email and password are required strings.");
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

    if (!user || !passwordMatches) {
      sendError(res, 401, "INVALID_CREDENTIALS", "Incorrect email or password.");
      return;
    }

    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });

    req.session.userId = user.id;
    req.session.role = user.role;

    req.session.save((err) => {
      if (err) {
        next(err);
        return;
      }
      res.status(200).json({ id: user.id, email: user.email, role: user.role });
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/auth/logout", (req, res, next) => {
  if (!req.session.userId) {
    sendError(res, 401, "UNAUTHENTICATED", "Authentication required.");
    return;
  }

  req.session.destroy((err) => {
    if (err) {
      next(err);
      return;
    }
    res.clearCookie(SESSION_COOKIE_NAME);
    res.status(200).json({ message: "logged out" });
  });
});

authRouter.get("/auth/me", async (req, res, next) => {
  try {
    if (!req.session.userId) {
      sendError(res, 401, "UNAUTHENTICATED", "Authentication required.");
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
    if (!user) {
      sendError(res, 401, "UNAUTHENTICATED", "Authentication required.");
      return;
    }

    res.status(200).json({ id: user.id, email: user.email, role: user.role });
  } catch (err) {
    next(err);
  }
});
