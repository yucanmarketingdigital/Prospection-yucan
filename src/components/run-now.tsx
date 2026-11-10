"use client";

import { useState, useTransition } from "react";
import { runNow } from "@/app/(app)/actions";
import { Button } from "./ui";

export function RunNowButton() {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="secondary"
      disabled={pending}
      title="L'extension exécutera la prochaine action due dans la minute, sans attendre la pause entre deux actions. Les limites quotidiennes restent appliquées."
      onClick={() => start(async () => { await runNow(); setDone(true); setTimeout(() => setDone(false), 4000); })}
    >
      {done ? "Demandé : l'extension s'en charge dans la minute" : "Exécuter une action maintenant"}
    </Button>
  );
}
