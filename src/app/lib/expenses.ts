export const STORAGE_EXPENSES = "lighthouse-expenses";

export type ExpenseDepartment =
  | "kitchen"
  | "barista"
  | "rooms"
  | "office"
  | "managing-director"
  | "staff-salary-allowance"
  | "staff-food"
  | "others"
  | "utilities-government";
export type ExpenseAmountType = "cash" | "mobile-money" | "card" | "bank" | "credit";

export interface ExpenseRecord {
  id: string;
  department: ExpenseDepartment;
  title: string;
  amount: number;
  amountType: ExpenseAmountType;
  notes?: string;
  createdAt: number;
  updatedAt?: number;
  createdBy?: string;
  payoutStatus?: "approved" | "paid-out";
  paidOutAt?: number;
  paidOutBy?: string;
}

export const EXPENSE_DEPARTMENTS: Array<{ value: ExpenseDepartment; label: string }> = [
  { value: "kitchen", label: "Kitchen" },
  { value: "barista", label: "Barista" },
  { value: "rooms", label: "Rooms" },
  { value: "office", label: "Office Expenses" },
  { value: "managing-director", label: "Managing Director" },
  { value: "staff-salary-allowance", label: "Staff Salary/Allowance" },
  { value: "staff-food", label: "Staff Food" },
  { value: "others", label: "Maintenance" },
  { value: "utilities-government", label: "Utilities and Government" },
];

export const EXPENSE_AMOUNT_TYPES: Array<{ value: ExpenseAmountType; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "mobile-money", label: "Mobile Money" },
  { value: "card", label: "Card" },
  { value: "bank", label: "Bank" },
  { value: "credit", label: "Credit" },
];

export function getExpenseDepartmentLabel(department: ExpenseDepartment) {
  return EXPENSE_DEPARTMENTS.find((item) => item.value === department)?.label ?? "Maintenance";
}

export function getExpenseAmountTypeLabel(amountType: ExpenseAmountType) {
  return EXPENSE_AMOUNT_TYPES.find((item) => item.value === amountType)?.label ?? "Cash";
}

const EXPENSE_DEPARTMENT_VALUES = new Set<ExpenseDepartment>(EXPENSE_DEPARTMENTS.map((item) => item.value));
const EXPENSE_AMOUNT_TYPE_VALUES = new Set<ExpenseAmountType>(EXPENSE_AMOUNT_TYPES.map((item) => item.value));

function normalizeExpenseDepartment(value: unknown): ExpenseDepartment {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");

  if (normalized === "bar" || normalized === "barista-expenses") return "barista";
  if (normalized === "restaurant" || normalized === "food" || normalized === "kitchen-expenses") return "kitchen";
  if (normalized === "maintenance") return "others";
  return EXPENSE_DEPARTMENT_VALUES.has(normalized as ExpenseDepartment)
    ? normalized as ExpenseDepartment
    : "others";
}

export function normalizeExpenseRecords(value: unknown): ExpenseRecord[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((record, index) => {
    if (typeof record !== "object" || record === null) return [];
    const source = record as Partial<ExpenseRecord> & { date?: string | number };
    const amount = Number(source.amount);
    if (!Number.isFinite(amount) || amount <= 0) return [];

    const parsedCreatedAt = Number(source.createdAt);
    const fallbackCreatedAt = source.date ? new Date(source.date).getTime() : NaN;
    const createdAt = Number.isFinite(parsedCreatedAt) && parsedCreatedAt > 0
      ? parsedCreatedAt
      : Number.isFinite(fallbackCreatedAt)
        ? fallbackCreatedAt
        : 0;
    const amountType = EXPENSE_AMOUNT_TYPE_VALUES.has(source.amountType as ExpenseAmountType)
      ? source.amountType as ExpenseAmountType
      : "cash";

    return [{
      ...source,
      id: typeof source.id === "string" && source.id.trim()
        ? source.id
        : `expense-${createdAt || index}-${index}`,
      department: normalizeExpenseDepartment(source.department),
      title: typeof source.title === "string" && source.title.trim() ? source.title.trim() : "Expense",
      amount,
      amountType,
      createdAt,
    } as ExpenseRecord];
  });
}
