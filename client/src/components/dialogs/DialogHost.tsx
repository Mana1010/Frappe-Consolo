"use client";

import { useUi } from "@/lib/store/ui";
import { DialogBar, Modal } from "@/components/ui/Modal";
import { ConnectionDialog } from "./ConnectionDialog";
import { ManageDialog } from "./ManageDialog";
import { SecretDialog } from "./SecretDialog";
import { HelpDialog } from "./HelpDialog";

export function DialogHost() {
  const d = useUi(s => s.dialog);
  if (!d) return null;
  switch (d.t) {
    case "conn": return <ConnectionDialog key={d.id || "new"} id={d.id} back={d.back} then={d.then} />;
    case "manage": return <ManageDialog note={d.note} />;
    case "secret": return <SecretDialog id={d.id} then={d.then} />;
    case "help": return <HelpDialog />;
    case "confirm": {
      const close = useUi.getState().closeDialog;
      return (
        <Modal title={d.title} onClose={close}>
          <DialogBar>
            <button className="btn" onClick={close}>Cancel</button>
            <button className="btn btn-primary" onClick={() => { close(); d.onYes(); }}>{d.yes}</button>
          </DialogBar>
        </Modal>
      );
    }
  }
}
