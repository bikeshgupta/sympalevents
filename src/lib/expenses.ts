import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth";

/**
 * The Expenses page's data - see api/expenses.ts.
 *
 * The flow it serves: a committee member pays for something out of their own
 * pocket, records it (optionally with a photo of the bill), and the admin pays
 * them back and marks it settled.
 *
 * The page reads through the API rather than `useEventData()`, because bills
 * live in a private bucket and only the server can hand out links to them,
 * and because a committee member without view access to the ledger still
 * gets their own claims. The dashboard's "Actual Expenses" total still comes
 * from `useEventData()`, which is why every write here invalidates both.
 */

/** null = recorded before claims were tracked; neither pending nor settled. */
export type ReimbursementStatus = "pending" | "settled" | "not_needed";

export type Expense = {
  id: string;
  date: string;
  category: string;
  item: string;
  amount: number;
  /** Who is owed. Empty for event funds. */
  paidBy: string;
  notes: string;
  createdAt: string;
  status: ReimbursementStatus | null;
  settledAt: string | null;
  settledByName: string | null;
  submittedByName: string | null;
  /** Recorded by the signed-in viewer. */
  mine: boolean;
  hasBill: boolean;
  /** A signed, one-hour link - null when there is no bill, or this viewer may
   *  not see it (bills are never shown to a signed-out visitor). */
  billUrl: string | null;
  billIsPdf: boolean;
};

export type ExpenseAccess = {
  canViewLedger: boolean;
  canSubmit: boolean;
  canManage: boolean;
  isAdmin: boolean;
};

export type LedgerResponse = {
  expenses: Expense[];
  /** False until migration 018 has been run: the ledger still loads, but
   *  claims, bills and settling are off, and the page says so. */
  claimsReady: boolean;
  /** "mine" when the viewer can file claims but not see the whole ledger. */
  scope: "all" | "mine";
  me: { id: string; name: string } | null;
  access: ExpenseAccess;
};

export type PaidFrom = "pocket" | "funds";

export type ExpenseInput = {
  date: string;
  category: string;
  item: string;
  amount: number;
  paidBy: string;
  notes: string;
  /** Omitted on an entry from before claims existed, to leave it untracked. */
  paidFrom?: PaidFrom;
  /** A data URL from `prepareBill`. */
  bill?: string;
  removeBill?: boolean;
};

export const noExpenseAccess: ExpenseAccess = {
  canViewLedger: false,
  canSubmit: false,
  canManage: false,
  isAdmin: false,
};

/**
 * What this viewer may do to one row. A mirror of the rules in
 * api/expenses.ts, used only to decide which controls to draw - the server
 * makes the actual call.
 */
export function expensePermissions(expense: Expense, access: ExpenseAccess) {
  const ownUnsettled = expense.mine && access.canSubmit && expense.status !== "settled";
  return {
    canEdit: access.canManage || ownUnsettled,
    canDelete: access.canManage || ownUnsettled,
    // Nobody signs off their own reimbursement, except the admin.
    canSettle: access.canManage && expense.status === "pending" && (access.isAdmin || !expense.mine),
    canUnsettle: access.canManage && expense.status === "settled",
  };
}

export function useExpenses(eventId?: string) {
  const { data: session, isLoading: isSessionLoading } = useSession();
  const queryClient = useQueryClient();

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["expenses"] }),
      queryClient.invalidateQueries({ queryKey: ["event-data"] }),
    ]);
  };

  const query = useQuery({
    queryKey: ["expenses", eventId, session?.user.appUserId ?? "guest"],
    enabled: Boolean(eventId) && !isSessionLoading,
    // The page may be public, so a signed-out request is legitimate; the
    // server decides what it gets.
    queryFn: () =>
      apiFetch<LedgerResponse>(`/api/expenses?eventId=${encodeURIComponent(eventId!)}`, { requireAuth: false }),
    retry: false,
    // Bill links are signed for an hour. Refreshing well inside that keeps a
    // page left open on a phone from handing out a dead link.
    refetchInterval: 30 * 60 * 1000,
  });

  const create = useMutation({
    mutationFn: (input: ExpenseInput) =>
      apiFetch<{ expenseId: string }>("/api/expenses", { method: "POST", body: { eventId, ...input } }),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, ...input }: ExpenseInput & { id: string }) =>
      apiFetch<{ ok: true }>("/api/expenses", { method: "PATCH", body: { id, ...input } }),
    onSuccess: invalidate,
  });

  const setSettled = useMutation({
    mutationFn: ({ id, settled }: { id: string; settled: boolean }) =>
      apiFetch<{ ok: true }>("/api/expenses", {
        method: "PATCH",
        body: { id, action: settled ? "settle" : "unsettle" },
      }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<{ ok: true }>("/api/expenses", { method: "DELETE", body: { id } }),
    onSuccess: invalidate,
  });

  return { query, create, update, setSettled, remove };
}

// --- Bills ---------------------------------------------------------------

/** The server's cap. A request carries the file as base64 inside JSON, and
 *  Vercel stops at 4.5MB, so 3MB is the most that still arrives. */
const BILL_MAX_BYTES = 3 * 1024 * 1024;
/** A photo already this small goes as it is, untouched. */
const SEND_AS_IS_BYTES = 1024 * 1024;
/** Long edge of a shrunk photo: enough to read a thermal till receipt. */
const MAX_EDGE = 2000;
const SENDABLE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type PreparedBill = {
  dataUrl: string;
  isPdf: boolean;
  name: string;
  bytes: number;
};

function readAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read the file"));
    reader.readAsDataURL(blob);
  });
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("This photo's format can't be opened here. Take a screenshot of it, or choose a JPEG or PNG."));
    image.src = url;
  });
}

/** Re-encodes a photo as a JPEG no longer than MAX_EDGE on its long side.
 *  Browsers apply the camera's EXIF rotation when drawing, so it stays upright. */
async function shrinkImage(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser couldn't prepare the photo. Try a different browser.");

    // Paint the page white first: JPEG has no transparency, and a transparent
    // PNG screenshot would otherwise come out black. (Pixel data, not theme.)
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) throw new Error("This browser couldn't prepare the photo. Try a different browser.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Gets a bill ready to send. Phone photos are routinely 3-8MB, so anything
 * over 1MB is shrunk on the device first (typically to a few hundred KB)
 * rather than refused - nobody should have to know what a megabyte is to get
 * paid back. PDFs are sent as they are, up to the 3MB cap.
 */
export async function prepareBill(file: File): Promise<PreparedBill> {
  if (file.type === "application/pdf") {
    if (file.size > BILL_MAX_BYTES) {
      throw new Error("That PDF is larger than 3MB. Attach a photo of the bill instead.");
    }
    return { dataUrl: await readAsDataUrl(file), isPdf: true, name: file.name, bytes: file.size };
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Attach a photo of the bill, or a PDF.");
  }

  if (SENDABLE_IMAGE_TYPES.has(file.type) && file.size <= SEND_AS_IS_BYTES) {
    return { dataUrl: await readAsDataUrl(file), isPdf: false, name: file.name, bytes: file.size };
  }

  const shrunk = await shrinkImage(file);
  if (shrunk.size > BILL_MAX_BYTES) {
    throw new Error("That photo is still too large after shrinking it. Try a screenshot of the bill instead.");
  }
  return { dataUrl: await readAsDataUrl(shrunk), isPdf: false, name: file.name, bytes: shrunk.size };
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
