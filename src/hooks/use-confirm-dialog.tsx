"use client";

import { useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmOptions {
  title: string;
  description: string;
  actionLabel?: string;
  cancelLabel?: string;
}

const DEFAULT_OPTIONS: ConfirmOptions = {
  title: "Confirm Action",
  description: "Are you sure you want to continue?",
  actionLabel: "Confirm",
  cancelLabel: "Cancel",
};

export function useConfirmDialog() {
  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>(DEFAULT_OPTIONS);

  const closeWithValue = (value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOpen(false);
  };

  const confirm = (nextOptions: ConfirmOptions) =>
    new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOptions({
        ...DEFAULT_OPTIONS,
        ...nextOptions,
      });
      setOpen(true);
    });

  const dialog = (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && open) closeWithValue(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{options.title}</AlertDialogTitle>
          <AlertDialogDescription>{options.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => closeWithValue(false)}>
            {options.cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => closeWithValue(true)}>
            {options.actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, dialog };
}
