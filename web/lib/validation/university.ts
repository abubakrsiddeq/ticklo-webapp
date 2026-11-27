import { z } from "zod";

// D-056: the university picker can say "other" and carry a typed name + city.
export const OTHER_UNIVERSITY = "other";

export const universityFields = {
  university_id: z.union([z.literal(""), z.literal(OTHER_UNIVERSITY), z.string().uuid("Choose an option from the list")]),
  new_university_name: z.string().trim().max(150, "Name must be at most 150 characters").optional(),
  new_university_city: z.string().trim().max(80, "City must be at most 80 characters").optional(),
};

type UniversityValues = { university_id: string; new_university_name?: string; new_university_city?: string };

/** When "Other" is chosen, the typed name and city are required. */
export function checkOtherUniversity(v: UniversityValues, ctx: z.RefinementCtx) {
  if (v.university_id !== OTHER_UNIVERSITY) return;
  if ((v.new_university_name ?? "").length < 3) {
    ctx.addIssue({ code: "custom", path: ["new_university_name"], message: "Enter your university's full name" });
  }
  if ((v.new_university_city ?? "").length < 2) {
    ctx.addIssue({ code: "custom", path: ["new_university_city"], message: "Enter the city" });
  }
}
