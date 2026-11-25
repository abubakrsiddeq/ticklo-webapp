import { z } from "zod";
import { emailField } from "./common";

// ORG-03
export const inviteSchema = z.object({
  email: emailField,
  role: z.enum(["member", "scanner"]),
});
