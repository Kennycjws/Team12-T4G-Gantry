"use client";

import { useEffect, useRef } from "react";
import type { ReaderEvent } from "@/lib/reader-bus";

const WEDGE_MAX_KEY_GAP_MS = 50;
const WEDGE_MIN_LENGTH = 6;

// Delivers card taps from either kind of reader:
// - NFC reader, via bridge/reader.mjs and the server event stream
// - "keyboard wedge" reader, which types the card number followed by Enter
export function useCardReader(onEvent: (event: ReaderEvent) => void) {
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });

  useEffect(() => {
    const source = new EventSource("/api/reader/events");
    source.onmessage = (message) => handler.current(JSON.parse(message.data));
    return () => source.close();
  }, []);

  useEffect(() => {
    let buffer = "";
    let lastKeyAt = 0;

    const onKeyDown = (e: KeyboardEvent) => {
      // Leave form fields alone, so a tap on the admin page can fill in the UID box.
      if (e.target instanceof HTMLInputElement) return;

      const now = performance.now();
      if (now - lastKeyAt > WEDGE_MAX_KEY_GAP_MS) buffer = "";
      lastKeyAt = now;

      if (e.key === "Enter") {
        if (buffer.length >= WEDGE_MIN_LENGTH) {
          handler.current({ type: "present", uid: buffer.toUpperCase() });
        }
        buffer = "";
      } else if (/^[0-9a-fA-F]$/.test(e.key)) {
        buffer += e.key;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
