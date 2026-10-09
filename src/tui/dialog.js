/**
 * @file dialog.js
 *
 * Blocking yes/no confirmation dialog for Ink.
 */

import { Box, Text, useInput } from "ink";
import { createElement as h, useState } from "react";

/**
 * @param {object} props
 * @param {string} props.message
 * @param {() => void} props.onConfirm
 * @param {() => void} props.onCancel
 */
export function ConfirmDialog({ message, onConfirm, onCancel }) {
  const [busy, setBusy] = useState(false);

  useInput(
    (input, key) => {
      if (busy) return;
      if (input === "y" || input === "Y" || key.return) {
        setBusy(true);
        onConfirm();
      } else if (input === "n" || input === "N" || key.escape) {
        onCancel();
      }
    },
    { isActive: true },
  );

  return h(
    Box,
    {
      borderStyle: "round",
      borderColor: "yellow",
      flexDirection: "column",
      paddingX: 1,
    },
    h(Text, null, message),
    h(Text, { dimColor: true }, busy ? "working…" : "y = yes · n/Esc = no"),
  );
}
