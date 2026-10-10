"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { authApi } from "@/lib/api/endpoints";
import { apiError } from "@/lib/api/client";
import { qk } from "@/lib/api/hooks";
import { useAuthPrompt } from "@/lib/store/auth-prompt";
import { toast } from "@/lib/store/ui";
import { DialogBar, Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";

const emailErr = (v: string) => (!v.trim() ? "Enter your email." : /^\S+@\S+\.\S+$/.test(v.trim()) ? "" : "That does not look like an email address.");
const passErr = (v: string, isNew: boolean) => (!v ? "Enter your password." : isNew && v.length < 8 ? "Use at least 8 characters." : "");

export function AuthDialog() {
  const { open, tab, reason } = useAuthPrompt();
  if (!open) return null;
  return <AuthForm key={tab + (reason || "")} initialTab={tab} reason={reason} />;
}

function AuthForm({ initialTab, reason }: { initialTab: "login" | "register"; reason: string | null }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState(initialTab);
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [name, setName] = useState("");
  const [errs, setErrs] = useState<{ email?: string; password?: string }>({});
  const [msg, setMsg] = useState<string | null>(null);
  const isNew = tab === "register";

  const m = useMutation({
    mutationFn: () => isNew ? authApi.register({ email: email.trim(), password, name: name.trim() || undefined }) : authApi.login({ email: email.trim(), password }),
    onSuccess: async ({ user }) => {
      qc.setQueryData(qk.me, user);
      toast(isNew ? "Account created. Signed in as " + user.email : "Signed in as " + user.email);
      useAuthPrompt.getState().succeed();
      await qc.invalidateQueries();
    },
    onError: e => {
      const a = apiError(e);
      setMsg(a.status === 429 ? "Too many attempts. Wait a few minutes and try again." : a.message);
      if (a.fields) setErrs(a.fields as typeof errs);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = { email: emailErr(email), password: passErr(password, isNew) };
    setErrs(next);
    setMsg(null);
    if (next.email || next.password) return;
    m.mutate();
  };

  return (
    <Modal title={isNew ? "Create account" : "Sign in"} onClose={() => useAuthPrompt.getState().cancel()} z={60}>
      {reason && <p className="!text-ink">{reason}</p>}
      <p>An account keeps your connections, saved scripts, run history and notes. Without one you can still run read-only queries on temporary connections.</p>
      <div role="tablist" className="tabbar mt-2 flex border-b border-line">
        {(["login", "register"] as const).map(t => (
          <button key={t} role="tab" type="button" aria-selected={tab === t} className="px-3 py-2 text-[13px]" onClick={() => { setTab(t); setErrs({}); setMsg(null); }}>
            {t === "login" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} noValidate>
        <Field label="Email" error={errs.email}>
          <input className={`input mono ${errs.email ? "bad" : ""}`} type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} onBlur={() => email && setErrs(x => ({ ...x, email: emailErr(email) }))} />
        </Field>
        {isNew && (
          <Field label="Name (optional)">
            <input className="input" autoComplete="name" value={name} maxLength={80} onChange={e => setName(e.target.value)} />
          </Field>
        )}
        <Field label="Password" error={errs.password}>
          <input className={`input mono ${errs.password ? "bad" : ""}`} type="password" autoComplete={isNew ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)} />
        </Field>
        <DialogBar msg={m.isPending ? "Checking…" : msg} bad={!!msg && !m.isPending}>
          <button type="button" className="btn" onClick={() => useAuthPrompt.getState().cancel()}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={m.isPending}>{isNew ? "Create account" : "Sign in"}</button>
        </DialogBar>
      </form>
    </Modal>
  );
}
