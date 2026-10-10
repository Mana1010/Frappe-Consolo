"use client";

import { useAuthPrompt } from "@/lib/store/auth-prompt";

/** Friendly placeholder for features that need an account. */
export function SignInPrompt({ what, reason }: { what: string; reason?: string }) {
  return (
    <div className="rounded-md border border-dashed border-line p-3 text-[13px] text-mute">
      <p className="m-0">{what}</p>
      <div className="mt-2 flex gap-1.5">
        <button className="btn btn-sm btn-primary" onClick={() => useAuthPrompt.getState().request(reason || null)}>Sign in</button>
        <button className="btn btn-sm" onClick={() => useAuthPrompt.getState().request(reason || null, undefined, undefined, "register")}>Create account</button>
      </div>
    </div>
  );
}
