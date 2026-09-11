"use client";

import { useEffect, useRef, useState } from "react";

export default function CopyMediaText({ text, label = "Copy description" }: { text: string; label?: string }) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Copied");
    } catch {
      setMessage("Select the text above to copy it.");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(""), 3500);
  }
  return <div><button type="button" onClick={copy}>{label}</button><span role="status" aria-live="polite">{message}</span></div>;
}
