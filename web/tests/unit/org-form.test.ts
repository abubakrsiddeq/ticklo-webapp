import { describe, expect, it } from "vitest";
import { checkOrgFile, orgCreateSchema, orgSchema, socialLinksFrom } from "@/lib/validation/org";
import { matchUniversities, universityLabel } from "@/lib/university-label";

const valid = {
  name: "Debating Society",
  university_id: "",
  new_university_name: "",
  new_university_city: "",
  type: "society",
  about: "We debate.",
  instagram: "",
  linkedin: "https://www.linkedin.com/company/debsoc",
  website: "",
};

const errorsOf = (input: Record<string, unknown>) => {
  const r = orgSchema.safeParse(input);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
};

describe("register society form (ORG-01)", () => {
  it("accepts a valid society", () => {
    expect(orgSchema.safeParse(valid).success).toBe(true);
  });

  it("requires a LinkedIn link on linkedin.com", () => {
    expect(errorsOf({ ...valid, linkedin: "" }).linkedin).toMatch(/required/);
    expect(errorsOf({ ...valid, linkedin: "https://facebook.com/debsoc" }).linkedin).toMatch(/LinkedIn/);
    expect(errorsOf({ ...valid, linkedin: "https://linkedin.com.evil.pk/x" }).linkedin).toBeDefined();
    expect(orgSchema.safeParse({ ...valid, linkedin: "https://pk.linkedin.com/company/x" }).success).toBe(true);
  });

  it("adds https:// when it was left out", () => {
    const r = orgSchema.parse({ ...valid, linkedin: "linkedin.com/company/debsoc", instagram: "instagram.com/debsoc" });
    expect(r.linkedin).toBe("https://linkedin.com/company/debsoc");
    expect(socialLinksFrom(r)).toEqual({ linkedin: "https://linkedin.com/company/debsoc", instagram: "https://instagram.com/debsoc" });
  });

  it("refuses unsafe or wrong links", () => {
    expect(errorsOf({ ...valid, website: "javascript:alert(1)" }).website).toBeDefined();
    expect(errorsOf({ ...valid, website: "https://user:pass@site.pk" }).website).toBeDefined();
    expect(errorsOf({ ...valid, website: "https://localhost" }).website).toBeDefined();
    expect(errorsOf({ ...valid, instagram: "https://tiktok.com/@debsoc" }).instagram).toBeDefined();
  });

  it("checks the society name", () => {
    expect(errorsOf({ ...valid, name: "1234" }).name).toBeDefined();
    expect(errorsOf({ ...valid, name: "<b>Soc</b>" }).name).toBeDefined();
    expect(errorsOf({ ...valid, name: "Visit https://spam.pk" }).name).toBeDefined();
    expect(errorsOf({ ...valid, name: "Soc\u0000iety" }).name).toBeDefined();
    expect(orgSchema.safeParse({ ...valid, name: "IEEE – NUST Chapter" }).success).toBe(true);
  });

  it("checks files before upload", () => {
    const file = (type: string, size: number) => new File([new Uint8Array(size)], "f", { type });
    expect(checkOrgFile(null, { label: "Proof", required: true })).toMatch(/required/);
    expect(checkOrgFile(file("image/png", 6 * 1024 * 1024), { label: "Logo" })).toMatch(/5 MB/);
    expect(checkOrgFile(file("application/pdf", 10), { label: "Logo" })).toMatch(/JPG/);
    expect(checkOrgFile(file("application/pdf", 10), { label: "Proof", allowPdf: true })).toBeNull();
  });
});

describe("society head (D-060)", () => {
  const head = { head_role: "other", head_name: "Ali Raza", head_phone: "0300 1234567", head_email: "ali@uni.edu.pk" };
  const createErrors = (input: Record<string, unknown>) => {
    const r = orgCreateSchema.safeParse(input);
    return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
  };

  it("needs a choice and all three details when registering", () => {
    expect(orgCreateSchema.safeParse({ ...valid, ...head }).success).toBe(true);
    expect(createErrors(valid).head_role).toBeDefined();
    const e = createErrors({ ...valid, head_role: "self", head_name: "", head_phone: "12", head_email: "x" });
    expect(Object.keys(e).sort()).toEqual(["head_email", "head_name", "head_phone"]);
  });

  it("is not asked when editing a society", () => {
    expect(orgSchema.safeParse(valid).success).toBe(true);
  });
});

describe("university list", () => {
  it("shows Name (City), taking a city off the end of the name", () => {
    expect(universityLabel({ name: "Bahria University (Karachi)", city: "Karachi" })).toBe("Bahria University (Karachi)");
    expect(universityLabel({ name: "Bahria University Islamabad", city: "islamabad" })).toBe("Bahria University (Islamabad)");
    expect(universityLabel({ name: "COMSATS University Islamabad", city: "Islamabad" })).toBe("COMSATS University (Islamabad)");
    expect(universityLabel({ name: "Bahria University, Lahore", city: "Lahore" })).toBe("Bahria University (Lahore)");
    expect(universityLabel({ name: "Air University", city: "Islamabad" })).toBe("Air University (Islamabad)");
    expect(universityLabel({ name: "Air University", city: "dera ismail khan" })).toBe("Air University (Dera Ismail Khan)");
    expect(universityLabel({ name: "Air University", city: null })).toBe("Air University");
  });

  it("leaves a city that is part of the real name alone", () => {
    expect(universityLabel({ name: "University of Karachi", city: "Karachi" })).toBe("University of Karachi");
    expect(universityLabel({ name: "Lahore University of Management Sciences", city: "Lahore" })).toBe("Lahore University of Management Sciences");
    expect(universityLabel({ name: "Karachi", city: "Karachi" })).toBe("Karachi");
    expect(universityLabel({ name: "Wahcantt Institute", city: "Wah" })).toBe("Wahcantt Institute (Wah)");
  });

  it("suggests approved universities that match what was typed", () => {
    const list = [
      { name: "University of Karachi", short_name: "KU", city: "Karachi", status: "approved" },
      { name: "National University of Sciences and Technology", short_name: "NUST", city: "Islamabad", status: "approved" },
      { name: "University of Nowhere", short_name: null, city: "Karachi", status: "pending" },
    ];
    expect(matchUniversities(list, "nust").map((u) => u.short_name)).toEqual(["NUST"]);
    expect(matchUniversities(list, "university karachi").map((u) => u.name)).toEqual(["University of Karachi"]);
    expect(matchUniversities(list, "u")).toEqual([]);
  });
});
