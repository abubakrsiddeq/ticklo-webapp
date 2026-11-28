/** D-086: what a society role is called on screen. The database keeps "scanner". */
export function roleLabel(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "member") return "Member";
  if (role === "scanner") return "Gate volunteer";
  return role;
}
