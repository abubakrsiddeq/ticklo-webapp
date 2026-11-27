"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { NativeSelect } from "@/components/native-select";
import { ActionButton } from "@/components/action-button";
import { changeMemberRole, removeMember } from "@/app/org/_actions/manage";
import { useActionTransition } from "@/lib/use-action-transition";

export function MemberRowActions({ orgSlug, userId, name, role }: { orgSlug: string; userId: string; name: string; role: string }) {
  const router = useRouter();
  const [pending, start] = useActionTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect
        aria-label={`Role for ${name}`}
        className="w-36"
        defaultValue={role}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            const res = await changeMemberRole(orgSlug, userId, e.target.value);
            if (res.ok) toast.success(res.message ?? "Updated");
            else toast.error(res.error);
            router.refresh();
          })
        }
      >
        <option value="member">Member</option>
        <option value="scanner">Scanner</option>
      </NativeSelect>
      <ActionButton
        variant="ghost"
        size="sm"
        className="text-destructive"
        action={removeMember.bind(null, orgSlug, userId)}
        confirm={{ title: `Remove ${name} from the team?`, description: "They lose access to the dashboard and scanner.", confirmLabel: "Remove" }}
      >
        Remove
      </ActionButton>
    </div>
  );
}
