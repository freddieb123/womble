import { Router } from "express";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { users } from "@db/schema";

const router = Router();

router.post("/auth/firebase", async (req, res) => {
  const { uid, email, displayName } = req.body;

  try {
    // Check if user exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.firebaseUid, uid),
    });

    if (existingUser) {
      // Update existing user if needed
      req.session.userId = existingUser.id;
      return res.json(existingUser);
    }

    // Create new user
    const [newUser] = await db
      .insert(users)
      .values({
        username: email?.split("@")[0] || displayName || "user",
        email: email || "",
        firebaseUid: uid,
      })
      .returning();

    req.session.userId = newUser.id;
    res.json(newUser);
  } catch (error) {
    console.error("Error in Firebase auth:", error);
    res.status(500).json({ error: "Failed to authenticate" });
  }
});

export default router;
