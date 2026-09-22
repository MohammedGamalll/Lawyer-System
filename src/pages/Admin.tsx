import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "../lib/api";
import { onDataChanged } from "../lib/bus";
import { useApp } from "../store";
import {
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  ConfirmBar,
  UiTabs,
} from "../components/ui";
import { DatePicker } from "../components/DateTimePicker";
import { LookupCombo, lookupLabel } from "../components/LookupCombo";
import { CrudPage } from "../components/CrudPage";
import { formatCell } from "../lib/datetime";
import {
  adminTasksRollTableHtml,
  compactTableHtml,
  executionTasksRollTableHtml,
  escPrint,
  hearingRollTableHtml,
  promoteSingleFilter,
  sendPrint,
} from "../lib/printKit";
import { PrintDesigner } from "./PrintDesigner";
import { wipeAllBusinessData } from "../lib/wipeData";
import {
  applyFontSize,
  clampFontSize,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
} from "../lib/uiPrefs";
import {
  parseSourceOrder,
  serializeSourceOrder,
  type AttachSource,
} from "../lib/attachSources";
import { useSyncStore, type SyncSnapshot } from "../store/sync";
import { ReorderList } from "../components/ReorderList";
import {
  DASHBOARD_SECTION_IDS,
  orderedDashboardSections,
  orderedNavItems,
  serializeIdList,
} from "../lib/layoutPrefs";

const REPORT_KEYS = [
  "clients",
  "cases",
  "cases_by_type",
  "cases_by_court",
  "cases_by_lawyer",
  "open_cases",
  "closed_cases",
  "delayed_cases",
  "hearings",
  "poa",
  "contracts",
  "tasks",
  "executions",
  "income",
  "expenses",
  "profit",
  "due",
  "payments",
  "lawyer_performance",
] as const;

export function ReportsPage() {
  const { t, i18n } = useTranslation();
  const { toast } = useApp();
  const [type, setType] = useState("cases");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [venue, setVenue] = useState("");
  const [rows, setRows] = useState<object[]>([]);
  const headerKeys = rows[0] ? Object.keys(rows[0] as object) : [];
  const colLabel = (k: string) =>
    t(`fields.${k}`, { defaultValue: t(`reports.${k}`, { defaultValue: k }) });
  const cell = (k: string, v: unknown) =>
    typeof v === "object" && v !== null
      ? ""
      : formatCell(k, v, i18n.language, t);
  const q = {
    type,
    from,
    to,
    venue:
      type === "hearings" || type === "tasks" || type === "executions"
        ? venue || undefined
        : undefined,
  };

  const run = () =>
    invoke<object[]>("reports:run", q)
      .then(setRows)
      .catch((e) => toast(e.message, "err"));
  useEffect(() => {
    run();
  }, [type, from, to, venue]);
  const exp = async (format: "xlsx" | "csv") => {
    const r = await invoke<{ canceled?: boolean }>("reports:export", q, format);
    if (!r?.canceled) toast(t("savedOk"));
  };
  const print = async () => {
    const period = [from, to].filter(Boolean).join(" — ");
    const dateLabel = (iso: string) =>
      formatCell("hearing_date", iso, i18n.language, t);
    const rangeTitle = (base: string, rangeKey: string) => {
      if (from && to)
        return t(rangeKey, { from: dateLabel(from), to: dateLabel(to) });
      if (from) return `${t(base)} — ${dateLabel(from)}`;
      if (to) return `${t(base)} — ${dateLabel(to)}`;
      return t(base);
    };
    if (type === "hearings" || type === "tasks" || type === "executions") {
      const data = (await invoke<Record<string, unknown>[]>(
        "reports:run",
        { ...q, print: true },
      )) as Record<string, unknown>[];
      const rows = Array.isArray(data) ? data : [];
      const roll =
        type === "hearings"
          ? hearingRollTableHtml(rows, t, i18n.language, {
              emptyLabel: t("noData"),
            })
          : type === "executions"
            ? executionTasksRollTableHtml(rows, t, i18n.language, {
                emptyLabel: t("noData"),
              })
            : adminTasksRollTableHtml(rows, t, i18n.language, {
                emptyLabel: t("noData"),
              });
      const title =
        type === "hearings"
          ? rangeTitle("reports.printHearings", "reports.printHearingsRange")
          : type === "executions"
            ? rangeTitle("reports.printExec", "reports.printExecRange")
            : rangeTitle("reports.printAdmin", "reports.printAdminRange");
      await sendPrint("report", title, roll.html, "hearingsRoll");
      if (rows.length >= 1000) toast(t("printListCapped", { count: 1000 }));
      return;
    }
    const filled = [
      { key: "period", label: t("fields.date"), value: period },
      { key: "venue", label: t("fields.venue"), value: venue },
    ];
    const promoted = promoteSingleFilter(filled.filter((x) => x.value));
    const keep = (rows[0] ? Object.keys(rows[0] as object) : []).filter(
      (k) => !promoted.dropKeys.has(k) && k !== "id" && !k.endsWith("_id"),
    );
    const body = compactTableHtml({
      columns: keep.map((k) => ({ label: colLabel(k) })),
      rows: rows.map((r) =>
        keep.map((k) => escPrint(cell(k, (r as Record<string, unknown>)[k]))),
      ),
      notesLabel: t("printKit.notes"),
      emptyLabel: t("noData"),
      subtitle: promoted.header,
    });
    await invoke("print:print", "report", t(`reports.${type}`), body);
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t("reports.title")} />
      <Card>
        <div className="flex flex-wrap gap-2">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {REPORT_KEYS.map((k) => (
              <option key={k} value={k}>
                {t(`reports.${k}`)}
              </option>
            ))}
          </Select>
          <DatePicker value={from} onChange={setFrom} />
          <DatePicker value={to} onChange={setTo} />
          {(type === "hearings" ||
            type === "tasks" ||
            type === "executions") && (
            <div className="w-44">
              <LookupCombo
                kind="venue"
                value={venue}
                onChange={setVenue}
                placeholder={t("fields.venue")}
              />
            </div>
          )}
          <Button onClick={run}>{t("reports.show")}</Button>
          <Button variant="outline" onClick={() => exp("xlsx")}>
            Excel
          </Button>
          <Button variant="outline" onClick={() => exp("csv")}>
            CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => print().catch((e) => toast(e.message, "err"))}
          >
            {t("print")}
          </Button>
        </div>
      </Card>
      <Card>
        <div className="data-table-wrap overflow-x-auto">
          <table className="w-max min-w-full border-collapse text-sm">
            <thead>
              <tr>
                {headerKeys.map((k) => (
                  <th key={k} className="px-3 py-2 text-start">
                    {colLabel(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t">
                  {headerKeys.map((k) => (
                    <td
                      key={k}
                      className="min-w-0 px-3 py-2 text-start align-middle leading-relaxed text-navy-900 dark:text-white"
                    >
                      {cell(k, (r as Record<string, unknown>)[k])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

const PERM_MODULE_ORDER = [
  "clients",
  "opponents",
  "cases",
  "hearings",
  "documents",
  "poa",
  "contracts",
  "calendar",
  "tasks",
  "reminders",
  "appointments",
  "consultations",
  "correspondence",
  "accounts",
  "cashbox",
  "invoices",
  "reports",
  "lawyers",
  "employees",
  "users",
  "settings",
  "archive",
  "audit",
  "backup",
];

function PermissionGroups({
  all,
  selected,
  setSelected,
}: {
  all: { code: string; name_ar: string; name_en?: string; module?: string }[];
  selected: string[];
  setSelected: (v: string[]) => void;
}) {
  const { t, i18n } = useTranslation();
  const groups = new Map<string, typeof all>();
  for (const p of all) {
    const m = p.module || p.code.split(".")[0];
    const list = groups.get(m) || [];
    list.push(p);
    groups.set(m, list);
  }
  const order = [
    ...PERM_MODULE_ORDER,
    ...[...groups.keys()].filter((k) => !PERM_MODULE_ORDER.includes(k)),
  ];
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {order.map((mod) => {
        const items = groups.get(mod);
        if (!items?.length) return null;
        const codes = items.map((p) => p.code);
        const allOn = codes.every((c) => selected.includes(c));
        return (
          <div
            key={mod}
            className="rounded-lg border border-navy-100 p-3 dark:border-navy-800"
          >
            <label className="mb-2 flex items-center justify-between gap-2 font-bold">
              <span>{t(`users.module.${mod}`, { defaultValue: mod })}</span>
              <span className="flex items-center gap-1 text-xs font-normal">
                <input
                  type="checkbox"
                  checked={allOn}
                  onChange={(e) => {
                    if (e.target.checked)
                      setSelected([...new Set([...selected, ...codes])]);
                    else
                      setSelected(selected.filter((c) => !codes.includes(c)));
                  }}
                />
                {t("users.selectAll")}
              </span>
            </label>
            <div className="space-y-1">
              {items.map((p) => (
                <label key={p.code} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(p.code)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, p.code]
                          : selected.filter((c) => c !== p.code),
                      )
                    }
                  />
                  {i18n.language === "en" ? p.name_en || p.name_ar : p.name_ar}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function UsersPage() {
  const { t } = useTranslation();
  const { toast, setPage, refreshMe } = useApp();
  const [permOpen, setPermOpen] = useState<{
    id: string;
    username: string;
    full_name: string;
  } | null>(null);
  const [all, setAll] = useState<
    { code: string; name_ar: string; name_en?: string; module?: string }[]
  >([]);
  const [selected, setSelected] = useState<string[]>([]);

  const openPerms = async (r: Record<string, unknown>) => {
    const id = String(r.id || "");
    const u = await invoke<{ permissions: string[] }>("users:get", id);
    const cat = await invoke<{
      permissions: {
        code: string;
        name_ar: string;
        name_en?: string;
        module?: string;
      }[];
    }>("users:permissions");
    setAll(cat.permissions);
    setSelected(u.permissions);
    setPermOpen({
      id,
      username: String(r.username || ""),
      full_name: String(r.full_name || ""),
    });
  };

  return (
    <div>
      <CrudPage
        title={t("nav.users")}
        listChannel="users:list"
        removeChannel="users:remove"
        deletePerm="users.manage"
        extraActions={
          <Button
            variant="gold"
            onClick={() => setPage("staffForm", { back: "users" })}
          >
            {t("hr.addUser")}
          </Button>
        }
        columns={[
          { key: "username", label: t("fields.username") },
          { key: "full_name", label: t("fields.full_name") },
          { key: "role_name", label: t("fields.role_name") },
          { key: "is_active", label: t("fields.is_active") },
          { key: "last_login_at", label: t("fields.last_login_at") },
        ]}
        fields={[]}
        onRowOpen={(r) =>
          setPage("staffForm", {
            userId: r.id,
            employeeId: r.employee_id,
            lawyerId: r.lawyer_id,
            back: "users",
          })
        }
        onEditRow={(r) =>
          setPage("staffForm", {
            userId: r.id,
            employeeId: r.employee_id,
            lawyerId: r.lawyer_id,
            back: "users",
          })
        }
        rowActions={(r) => (
          <>
            <Button
              variant="ghost"
              onClick={() =>
                openPerms(r).catch((e) => toast((e as Error).message, "err"))
              }
            >
              {t("users.perms")}
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                const next = window.prompt(t("users.newPasswordPrompt"));
                if (!next) return;
                await invoke("auth:resetPassword", r.id, next);
                toast(t("savedOk"));
              }}
            >
              {t("resetPassword")}
            </Button>
          </>
        )}
      />
      {permOpen && (
        <Card className="mt-4">
          <h3 className="mb-2 font-bold">
            {t("users.permsFor", {
              name: permOpen.full_name || permOpen.username,
              username: permOpen.username,
            })}
          </h3>
          <PermissionGroups
            all={all}
            selected={selected}
            setSelected={setSelected}
          />
          <Button
            className="mt-3"
            onClick={async () => {
              await invoke("users:setPermissions", permOpen.id, selected);
              await refreshMe().catch(() => undefined);
              toast(t("savedOk"));
              setPermOpen(null);
            }}
          >
            {t("users.savePerms")}
          </Button>
        </Card>
      )}
    </div>
  );
}

export function AuditPage() {
  const { t } = useTranslation();
  return (
    <CrudPage
      title={t("nav.audit")}
      listChannel="audit:list"
      removeChannel="audit:remove"
      deletePerm="audit.delete"
      columns={[
        { key: "created_at", label: t("fields.created_at") },
        { key: "username", label: t("fields.username") },
        { key: "action", label: t("fields.action") },
        { key: "entity_type", label: t("fields.entity_type") },
        { key: "description", label: t("fields.description") },
      ]}
      fields={[]}
    />
  );
}

function LookupKindEditor({
  kind,
  title,
  hint,
}: {
  kind: string;
  title: string;
  hint?: string;
}) {
  const { t } = useTranslation();
  const { toast } = useApp();
  const [rows, setRows] = useState<{ value: string }[]>([]);
  const [val, setVal] = useState("");
  const [editFrom, setEditFrom] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [pendingDel, setPendingDel] = useState<string | null>(null);
  const load = () =>
    invoke<{ value: string }[]>("lookups:list", kind)
      .then(setRows)
      .catch((e) => toast((e as Error).message, "err"));
  useEffect(() => {
    load();
    return onDataChanged(() => load(), "lookups");
  }, [kind]);
  return (
    <Card>
      <h3 className="mb-1 font-bold">{title}</h3>
      {hint ? <p className="mb-3 text-xs text-navy-500">{hint}</p> : null}
      <div className="flex max-w-xl gap-2">
        <Input value={val} onChange={(e) => setVal(e.target.value)} />
        <Button
          onClick={async () => {
            if (!val.trim()) return;
            try {
              await invoke("lookups:remember", kind, val.trim());
              setVal("");
              await load();
            } catch (e) {
              toast((e as Error).message, "err");
            }
          }}
        >
          {t("add")}
        </Button>
      </div>
      <ul className="mt-2 max-w-xl space-y-1 text-sm">
        {rows.map((x) => (
          <li key={x.value} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              {editFrom === x.value ? (
                <Input
                  className="flex-1"
                  value={editVal}
                  onChange={(e) => setEditVal(e.target.value)}
                />
              ) : (
                <span className="min-w-0 flex-1 truncate">
                  {lookupLabel(kind, x.value, t)}
                </span>
              )}
              <span className="flex shrink-0 gap-1">
                {editFrom === x.value ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          await invoke(
                            "lookups:update",
                            kind,
                            x.value,
                            editVal.trim(),
                          );
                          setEditFrom(null);
                          await load();
                        } catch (e) {
                          toast((e as Error).message, "err");
                        }
                      }}
                    >
                      {t("save")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditFrom(null)}
                    >
                      {t("cancel")}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      title={t("moveUp")}
                      onClick={async () => {
                        try {
                          await invoke("lookups:reorder", kind, x.value, "up");
                          await load();
                        } catch (e) {
                          toast((e as Error).message, "err");
                        }
                      }}
                    >
                      ▲
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title={t("moveDown")}
                      onClick={async () => {
                        try {
                          await invoke(
                            "lookups:reorder",
                            kind,
                            x.value,
                            "down",
                          );
                          await load();
                        } catch (e) {
                          toast((e as Error).message, "err");
                        }
                      }}
                    >
                      ▼
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPendingDel(null);
                        setEditFrom(x.value);
                        setEditVal(x.value);
                      }}
                    >
                      {t("edit")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditFrom(null);
                        setPendingDel(x.value);
                      }}
                    >
                      {t("delete")}
                    </Button>
                  </>
                )}
              </span>
            </div>
            {pendingDel === x.value ? (
              <div className="rounded border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/40">
                <p className="text-sm">
                  {t("lookups.confirmRemove", { value: x.value })}
                </p>
                <ConfirmBar
                  onCancel={() => setPendingDel(null)}
                  onConfirm={async () => {
                    try {
                      await invoke("lookups:remove", kind, x.value);
                      setPendingDel(null);
                      await load();
                    } catch (e) {
                      toast((e as Error).message, "err");
                    }
                  }}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { toast, can, setPage } = useApp();
  const [s, setS] = useState<Record<string, string>>({});
  const [pw, setPw] = useState({ current: "", next: "" });
  const [types, setTypes] = useState<{ id: string; name_ar: string }[]>([]);
  const [printers, setPrinters] = useState<{ name: string }[]>([]);
  const [newType, setNewType] = useState("");
  const [wiping, setWiping] = useState(false);
  const [editTypeId, setEditTypeId] = useState<string | null>(null);
  const [editTypeVal, setEditTypeVal] = useState("");
  const [delTypeId, setDelTypeId] = useState<string | null>(null);
  const [wipeAsk, setWipeAsk] = useState(false);

  useEffect(() => {
    invoke<Record<string, string>>("settings:get").then(setS);
    invoke<{ id: string; name_ar: string }[]>("caseTypes:list").then(setTypes);
    invoke<{ name: string }[]>("print:printers")
      .then(setPrinters)
      .catch(() => setPrinters([]));
    return onDataChanged(
      () =>
        invoke<{ id: string; name_ar: string }[]>("caseTypes:list").then(
          setTypes,
        ),
      "caseTypes",
    );
  }, []);

  const save = async () => {
    await invoke("settings:set", s);
    i18n.changeLanguage(s.language || "ar");
    useApp.getState().applyTheme(s.theme === "dark" ? "dark" : "light");
    document.documentElement.dir = s.language === "en" ? "ltr" : "rtl";
    applyFontSize(Number(s.ui_font_size || 16));
    toast(t("savedOk"));
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("nav.settings")}
        actions={
          <span className="flex flex-wrap gap-2">
            {can("users.manage") ? (
              <Button variant="outline" onClick={() => setPage("users")}>
                {t("nav.users")}
              </Button>
            ) : null}
            {can("settings.manage") ? (
              <Button
                onClick={() => save().catch((e) => toast(e.message, "err"))}
              >
                {t("save")}
              </Button>
            ) : null}
          </span>
        }
      />
      <UiTabs
        tabs={[
          {
            id: "office",
            label: t("settings.tabOffice"),
            body: can("settings.manage") ? (
              <div className="space-y-4">
                <Card>
                  <h3 className="mb-3 font-bold">{t("settings.office")}</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {[
                      "office_name",
                      "office_address",
                      "office_phone",
                      "office_phone2",
                      "office_phone3",
                      "office_email",
                      "currency",
                    ].map((k) => (
                      <Field key={k} label={t(`settings.${k}`)}>
                        <Input
                          value={s[k] || ""}
                          onChange={(e) => setS({ ...s, [k]: e.target.value })}
                        />
                      </Field>
                    ))}
                    <Field label={t("settings.language")}>
                      <Select
                        value={s.language || "ar"}
                        onChange={(e) =>
                          setS({ ...s, language: e.target.value })
                        }
                      >
                        <option value="ar">العربية</option>
                        <option value="en">English</option>
                      </Select>
                    </Field>
                    <Field label={t("settings.theme")}>
                      <Select
                        value={s.theme || "light"}
                        onChange={(e) => setS({ ...s, theme: e.target.value })}
                      >
                        <option value="light">{t("light")}</option>
                        <option value="dark">{t("dark")}</option>
                      </Select>
                    </Field>
                    <Field label={t("settings.logo")}>
                      <Button
                        variant="outline"
                        type="button"
                        onClick={async () => {
                          const file = await invoke<{
                            name: string;
                            data: number[];
                          }>("files:pick");
                          await invoke("settings:saveLogo", file);
                          toast(t("savedOk"));
                        }}
                      >
                        {t("settings.uploadLogo")}
                      </Button>
                    </Field>
                  </div>
                </Card>
                <Card>
                  <h3 className="mb-3 font-bold">{t("settings.appearance")}</h3>
                  <Field
                    label={`${t("settings.fontSize")} (${clampFontSize(Number(s.ui_font_size || 16))}px)`}
                  >
                    <input
                      type="range"
                      min={FONT_SIZE_MIN}
                      max={FONT_SIZE_MAX}
                      step={1}
                      className="h-2 w-full max-w-md cursor-pointer accent-gold-400"
                      value={clampFontSize(Number(s.ui_font_size || 16))}
                      onChange={(e) => {
                        const ui_font_size = e.target.value;
                        setS({ ...s, ui_font_size });
                        applyFontSize(Number(ui_font_size));
                      }}
                    />
                    <p className="mt-1 text-sm text-navy-500">
                      {t("settings.fontSizeHint")}
                    </p>
                  </Field>
                  <div className="mt-4">
                    <h4 className="mb-1 font-bold">
                      {t("settings.attachOrder")}
                    </h4>
                    <p className="mb-2 text-sm text-navy-500">
                      {t("settings.attachOrderHint")}
                    </p>
                    <ol className="max-w-md space-y-1">
                      {parseSourceOrder(s.attach_source_order).map(
                        (src, i, arr) => (
                          <li
                            key={src}
                            className="flex items-center justify-between gap-2 rounded border border-navy-100 px-2 py-1 dark:border-navy-800"
                          >
                            <span>
                              {t(
                                src === "scanner"
                                  ? "docs.fromScanner"
                                  : src === "camera"
                                    ? "docs.fromCamera"
                                    : "docs.fromFile",
                              )}
                            </span>
                            <span className="flex gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={i === 0}
                                onClick={() => {
                                  const next = [...arr];
                                  [next[i - 1], next[i]] = [
                                    next[i],
                                    next[i - 1],
                                  ];
                                  setS({
                                    ...s,
                                    attach_source_order: serializeSourceOrder(
                                      next as AttachSource[],
                                    ),
                                  });
                                }}
                              >
                                ↑
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={i === arr.length - 1}
                                onClick={() => {
                                  const next = [...arr];
                                  [next[i + 1], next[i]] = [
                                    next[i],
                                    next[i + 1],
                                  ];
                                  setS({
                                    ...s,
                                    attach_source_order: serializeSourceOrder(
                                      next as AttachSource[],
                                    ),
                                  });
                                }}
                              >
                                ↓
                              </Button>
                            </span>
                          </li>
                        ),
                      )}
                    </ol>
                  </div>
                </Card>
                <Card>
                  <h3 className="mb-3 font-bold">{t("settings.navOrder")}</h3>
                  <p className="mb-2 text-sm text-navy-500">
                    {t("settings.navOrderHint")}
                  </p>
                  <ReorderList
                    items={orderedNavItems(s.nav_order).map((n) => ({
                      id: n.id,
                      label: t(`nav.${n.id}`),
                    }))}
                    onChange={(ids) =>
                      setS({ ...s, nav_order: serializeIdList(ids) })
                    }
                  />
                  <h3 className="mb-2 mt-4 font-bold">
                    {t("settings.dashOrder")}
                  </h3>
                  <ReorderList
                    items={orderedDashboardSections(s.dashboard_sections).map(
                      (id) => ({
                        id,
                        label: t(
                          `dash.section${id[0].toUpperCase()}${id.slice(1)}`,
                        ),
                      }),
                    )}
                    onChange={(ids) =>
                      setS({ ...s, dashboard_sections: serializeIdList(ids) })
                    }
                  />
                </Card>
                <Card>
                  <h3 className="mb-3 font-bold">{t("sync.title")}</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label={t("sync.url")}>
                      <Input
                        value={s.supabase_url || ""}
                        readOnly
                        disabled
                        className="opacity-80"
                      />
                    </Field>
                    <Field label={t("sync.anonKey")}>
                      <Input
                        type="password"
                        autoComplete="off"
                        value={s.supabase_anon_key || ""}
                        readOnly
                        disabled
                        className="opacity-80"
                      />
                    </Field>
                  </div>
                  <p className="mt-2 text-sm text-navy-500">{t("sync.hint")}</p>
                  <div className="mt-3">
                    <Button
                      variant="outline"
                      type="button"
                      onClick={async () => {
                        await invoke("settings:set", s);
                        const snap = await invoke<SyncSnapshot>("sync:now");
                        useSyncStore.getState().setSnapshot(snap);
                        if (snap.status === "synced") toast(t("sync.doneOk"));
                        else if (snap.status === "offline")
                          toast(snap.error || t("sync.offline"), "err");
                        else if (snap.error) toast(snap.error, "err");
                        else
                          toast(
                            t("sync.stillPending", {
                              count: snap.pendingCount,
                            }),
                          );
                      }}
                    >
                      {t("sync.now")}
                    </Button>
                  </div>
                </Card>
                <Card>
                  <h3 className="mb-3 font-bold">{t("settings.printing")}</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label={t("settings.a4Printer")}>
                      <Select
                        value={s.print_a4_printer || ""}
                        onChange={(e) =>
                          setS({ ...s, print_a4_printer: e.target.value })
                        }
                      >
                        <option value="">{t("settings.defaultPrinter")}</option>
                        {printers.map((p) => (
                          <option key={p.name} value={p.name}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={t("settings.thermalPrinter")}>
                      <Select
                        value={s.print_thermal_printer || ""}
                        onChange={(e) =>
                          setS({ ...s, print_thermal_printer: e.target.value })
                        }
                      >
                        <option value="">{t("settings.defaultPrinter")}</option>
                        {printers.map((p) => (
                          <option key={p.name} value={p.name}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={t("settings.silentPrint")}>
                      <Select
                        value={s.silent_print || "false"}
                        onChange={(e) =>
                          setS({ ...s, silent_print: e.target.value })
                        }
                      >
                        <option value="false">{t("status.no")}</option>
                        <option value="true">{t("status.yes")}</option>
                      </Select>
                    </Field>
                    <Field label={t("settings.printLandscape")}>
                      <Select
                        value={
                          s.print_orientation ||
                          (s.print_landscape === "true"
                            ? "landscape"
                            : "portrait")
                        }
                        onChange={(e) =>
                          setS({
                            ...s,
                            print_orientation: e.target.value,
                            print_landscape:
                              e.target.value === "landscape" ? "true" : "false",
                          })
                        }
                      >
                        <option value="portrait">
                          {t("settings.portrait")}
                        </option>
                        <option value="landscape">
                          {t("settings.landscape")}
                        </option>
                      </Select>
                    </Field>
                    <Field label={t("settings.checkUpdates")}>
                      <Select
                        value={s.auto_update || "true"}
                        onChange={(e) =>
                          setS({ ...s, auto_update: e.target.value })
                        }
                      >
                        <option value="true">{t("status.yes")}</option>
                        <option value="false">{t("status.no")}</option>
                      </Select>
                    </Field>
                    <Field label={t("settings.updateFeedUrl")}>
                      <Input
                        value={s.update_feed_url || ""}
                        onChange={(e) =>
                          setS({ ...s, update_feed_url: e.target.value })
                        }
                        placeholder=""
                      />
                    </Field>
                    <p className="text-sm text-navy-500 md:col-span-2">
                      {t("settings.updateFeedHint")}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={async () => {
                        const r = await invoke<{
                          none?: boolean;
                          error?: string;
                        }>("updater:check");
                        if (r?.error) toast(r.error, "err");
                        else if (r?.none) toast(t("settings.noUpdates"));
                        else toast(t("settings.checkUpdates"));
                      }}
                    >
                      {t("settings.checkUpdates")}
                    </Button>
                  </div>
                </Card>
              </div>
            ) : (
              <p className="text-sm text-navy-500">{t("forbidden")}</p>
            ),
          },
          {
            id: "lists",
            label: t("settings.tabLists"),
            body: can("settings.manage") ? (
              <div className="space-y-4">
                <p className="text-sm text-navy-600 dark:text-navy-300">
                  {t("settings.listsSplitHint")}
                </p>
                <UiTabs
                  tabs={[
                    {
                      id: "seq",
                      label: t("settings.listSequence"),
                      body: (
                        <Card>
                          <h3 className="mb-3 font-bold">
                            {t("settings.caseSequence")}
                          </h3>
                          <p className="mb-2 text-sm text-navy-500">
                            {t("settings.caseSequenceHint", {
                              next: s.case_sequence_next || "—",
                            })}
                          </p>
                          <Field label={t("settings.caseSequenceCurrent")}>
                            <Input
                              className="max-w-xs"
                              type="number"
                              value={s.case_sequence_current || ""}
                              onChange={(e) =>
                                setS({
                                  ...s,
                                  case_sequence_current: e.target.value,
                                })
                              }
                            />
                          </Field>
                        </Card>
                      ),
                    },
                    {
                      id: "types",
                      label: t("settings.listCaseTypes"),
                      body: (
                        <Card>
                          <h3 className="mb-1 font-bold">
                            {t("settings.caseTypes")}
                          </h3>
                          <p className="mb-3 text-xs text-navy-500">
                            {t("settings.caseTypesHint")}
                          </p>
                          <div className="flex max-w-xl gap-2">
                            <Input
                              value={newType}
                              onChange={(e) => setNewType(e.target.value)}
                            />
                            <Button
                              onClick={async () => {
                                try {
                                  await invoke("caseTypes:create", newType);
                                  setTypes(await invoke("caseTypes:list"));
                                  setNewType("");
                                } catch (e) {
                                  toast((e as Error).message, "err");
                                }
                              }}
                            >
                              {t("add")}
                            </Button>
                          </div>
                          <ul className="mt-2 max-w-xl space-y-1 text-sm">
                            {types.map((x) => (
                              <li key={x.id} className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  {editTypeId === x.id ? (
                                    <Input
                                      className="flex-1"
                                      value={editTypeVal}
                                      onChange={(e) =>
                                        setEditTypeVal(e.target.value)
                                      }
                                    />
                                  ) : (
                                    <span className="min-w-0 flex-1 truncate">
                                      {x.name_ar}
                                    </span>
                                  )}
                                  <span className="flex shrink-0 gap-1">
                                    {editTypeId === x.id ? (
                                      <>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={async () => {
                                            try {
                                              await invoke(
                                                "caseTypes:update",
                                                x.id,
                                                {
                                                  name_ar: editTypeVal.trim(),
                                                  name_en: editTypeVal.trim(),
                                                },
                                              );
                                              setEditTypeId(null);
                                              setTypes(
                                                await invoke("caseTypes:list"),
                                              );
                                            } catch (e) {
                                              toast(
                                                (e as Error).message,
                                                "err",
                                              );
                                            }
                                          }}
                                        >
                                          {t("save")}
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setEditTypeId(null)}
                                        >
                                          {t("cancel")}
                                        </Button>
                                      </>
                                    ) : (
                                      <>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          title={t("moveUp")}
                                          onClick={async () => {
                                            try {
                                              await invoke(
                                                "caseTypes:reorder",
                                                x.id,
                                                "up",
                                              );
                                              setTypes(
                                                await invoke("caseTypes:list"),
                                              );
                                            } catch (e) {
                                              toast(
                                                (e as Error).message,
                                                "err",
                                              );
                                            }
                                          }}
                                        >
                                          ▲
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          title={t("moveDown")}
                                          onClick={async () => {
                                            try {
                                              await invoke(
                                                "caseTypes:reorder",
                                                x.id,
                                                "down",
                                              );
                                              setTypes(
                                                await invoke("caseTypes:list"),
                                              );
                                            } catch (e) {
                                              toast(
                                                (e as Error).message,
                                                "err",
                                              );
                                            }
                                          }}
                                        >
                                          ▼
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => {
                                            setDelTypeId(null);
                                            setEditTypeId(x.id);
                                            setEditTypeVal(x.name_ar);
                                          }}
                                        >
                                          {t("edit")}
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setDelTypeId(x.id)}
                                        >
                                          {t("delete")}
                                        </Button>
                                      </>
                                    )}
                                  </span>
                                </div>
                                {delTypeId === x.id ? (
                                  <div className="rounded border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/40">
                                    <p className="text-sm">
                                      {t("confirmDelete")}
                                    </p>
                                    <ConfirmBar
                                      onCancel={() => setDelTypeId(null)}
                                      onConfirm={async () => {
                                        try {
                                          await invoke(
                                            "caseTypes:remove",
                                            x.id,
                                          );
                                          setDelTypeId(null);
                                          setTypes(
                                            await invoke("caseTypes:list"),
                                          );
                                        } catch (e) {
                                          toast((e as Error).message, "err");
                                        }
                                      }}
                                    />
                                  </div>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </Card>
                      ),
                    },
                    {
                      id: "subjects",
                      label: t("settings.listSubjects"),
                      body: (
                        <LookupKindEditor
                          kind="case_subject"
                          title={t("settings.caseSubjects")}
                          hint={t("settings.caseSubjectsHint")}
                        />
                      ),
                    },
                    {
                      id: "courts",
                      label: t("settings.listCourts"),
                      body: (
                        <LookupKindEditor
                          kind="court"
                          title={t("settings.courts")}
                          hint={t("settings.courtsHint")}
                        />
                      ),
                    },
                    {
                      id: "docs",
                      label: t("settings.listDocs"),
                      body: (
                        <LookupKindEditor
                          kind="doc_category"
                          title={t("settings.docCategories")}
                        />
                      ),
                    },
                    {
                      id: "police",
                      label: t("settings.listPolice"),
                      body: (
                        <LookupKindEditor
                          kind="police_station"
                          title={t("fields.police_station")}
                        />
                      ),
                    },
                    {
                      id: "link",
                      label: t("settings.listLink"),
                      body: (
                        <LookupKindEditor
                          kind="link_type"
                          title={t("fields.link_type")}
                        />
                      ),
                    },
                    {
                      id: "poaOffice",
                      label: t("settings.listPoaOffice"),
                      body: (
                        <LookupKindEditor
                          kind="poa_office"
                          title={t("fields.poa_office")}
                        />
                      ),
                    },
                    {
                      id: "taskStatus",
                      label: t("settings.listTaskStatus"),
                      body: (
                        <LookupKindEditor
                          kind="task_status"
                          title={t("fields.status")}
                        />
                      ),
                    },
                    {
                      id: "exec",
                      label: t("settings.listExec"),
                      body: (
                        <LookupKindEditor
                          kind="execution_action"
                          title={t("caseForm.executionWork")}
                        />
                      ),
                    },
                    {
                      id: "execKind",
                      label: t("fields.execution_kind"),
                      body: (
                        <LookupKindEditor
                          kind="execution_kind"
                          title={t("fields.execution_kind")}
                        />
                      ),
                    },
                    {
                      id: "pay",
                      label: t("settings.listPayType"),
                      body: (
                        <LookupKindEditor
                          kind="payment_type"
                          title={t("fields.payment_type")}
                        />
                      ),
                    },
                    {
                      id: "due",
                      label: t("settings.listDueType"),
                      body: (
                        <LookupKindEditor
                          kind="due_type"
                          title={t("fields.due_type")}
                        />
                      ),
                    },
                    {
                      id: "venue",
                      label: t("settings.listVenue"),
                      body: (
                        <LookupKindEditor
                          kind="venue"
                          title={t("fields.venue")}
                        />
                      ),
                    },
                    {
                      id: "admin",
                      label: t("settings.listAdmin"),
                      body: (
                        <LookupKindEditor
                          kind="admin_action"
                          title={t("caseForm.adminWork")}
                        />
                      ),
                    },
                    {
                      id: "hearingType",
                      label: t("settings.listHearingType"),
                      body: (
                        <LookupKindEditor
                          kind="hearing_type"
                          title={t("fields.hearing_type")}
                        />
                      ),
                    },
                    {
                      id: "hearingStatus",
                      label: t("settings.listHearingStatus"),
                      body: (
                        <LookupKindEditor
                          kind="hearing_status"
                          title={t("settings.listHearingStatus")}
                        />
                      ),
                    },
                    {
                      id: "caseStatus",
                      label: t("settings.listCaseStatus"),
                      body: (
                        <LookupKindEditor
                          kind="case_status"
                          title={t("settings.listCaseStatus")}
                        />
                      ),
                    },
                    {
                      id: "extraRef",
                      label: t("settings.listExtraRef"),
                      body: (
                        <LookupKindEditor
                          kind="extra_ref_type"
                          title={t("fields.extra_ref_type")}
                        />
                      ),
                    },
                    {
                      id: "capacity",
                      label: t("settings.listCapacity"),
                      body: (
                        <LookupKindEditor
                          kind="capacity"
                          title={t("settings.listCapacity")}
                        />
                      ),
                    },
                    {
                      id: "policeReportKind",
                      label: t("settings.listPoliceReportKind"),
                      body: (
                        <LookupKindEditor
                          kind="police_report_kind"
                          title={t("fields.police_report_kind")}
                        />
                      ),
                    },
                    {
                      id: "profession",
                      label: t("settings.listProfession"),
                      body: (
                        <LookupKindEditor
                          kind="profession"
                          title={t("fields.profession")}
                        />
                      ),
                    },
                    {
                      id: "staffStatus",
                      label: t("settings.listStaffStatus"),
                      body: (
                        <LookupKindEditor
                          kind="staff_status"
                          title={t("settings.listStaffStatus")}
                        />
                      ),
                    },
                    {
                      id: "poaStatus",
                      label: t("settings.listPoaStatus"),
                      body: (
                        <LookupKindEditor
                          kind="poa_status"
                          title={t("settings.listPoaStatus")}
                        />
                      ),
                    },
                    {
                      id: "contractStatus",
                      label: t("settings.listContractStatus"),
                      body: (
                        <LookupKindEditor
                          kind="contract_status"
                          title={t("settings.listContractStatus")}
                        />
                      ),
                    },
                  ]}
                />
              </div>
            ) : (
              <p className="text-sm text-navy-500">{t("forbidden")}</p>
            ),
          },
          {
            id: "print",
            label: t("settings.tabPrint"),
            body: can("settings.manage") ? (
              <PrintDesigner />
            ) : (
              <p className="text-sm text-navy-500">{t("forbidden")}</p>
            ),
          },
          {
            id: "account",
            label: t("settings.tabAccount"),
            body: (
              <Card>
                <h3 className="mb-3 font-bold">{t("settings.password")}</h3>
                <div className="grid max-w-xl gap-3 md:grid-cols-2">
                  <Field label={t("currentPassword")}>
                    <Input
                      type="password"
                      value={pw.current}
                      onChange={(e) =>
                        setPw({ ...pw, current: e.target.value })
                      }
                    />
                  </Field>
                  <Field label={t("newPassword")}>
                    <Input
                      type="password"
                      value={pw.next}
                      onChange={(e) => setPw({ ...pw, next: e.target.value })}
                    />
                  </Field>
                </div>
                <Button
                  className="mt-2"
                  onClick={async () => {
                    await invoke("auth:changePassword", pw.current, pw.next);
                    toast(t("savedOk"));
                  }}
                >
                  {t("changePassword")}
                </Button>
              </Card>
            ),
          },
          {
            id: "backup",
            label: t("settings.tabBackup"),
            body: (
              <div className="space-y-4">
                {can("settings.manage") ? (
                  <Card>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={async () => {
                          const r = await invoke<{
                            file: string;
                            canceled?: boolean;
                          }>("backup:createToDir");
                          if (r?.canceled) return;
                          toast(t("settings.backupSaved", { file: r.file }));
                        }}
                      >
                        {t("settings.backupToDisk")}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={async () => {
                          const r = await invoke<{ file: string }>(
                            "backup:create",
                          );
                          toast(r.file);
                        }}
                      >
                        {t("settings.backupNow")}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={async () => {
                          const r = await invoke<{ deleted: number }>(
                            "files:gc",
                          );
                          toast(String(r.deleted));
                        }}
                      >
                        {t("settings.gc")}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={async () => {
                          await invoke("demo:seed");
                          toast(t("savedOk"));
                        }}
                      >
                        {t("settings.demo")}
                      </Button>
                      <Button
                        variant="gold"
                        onClick={async () => {
                          const r = await invoke<{ canceled?: boolean }>(
                            "print:manual",
                          );
                          if (!r?.canceled) toast(t("savedOk"));
                        }}
                      >
                        {t("settings.downloadManual")}
                      </Button>
                      <Button
                        variant="danger"
                        disabled={wiping}
                        onClick={() => setWipeAsk(true)}
                      >
                        {wiping ? t("loading") : t("settings.wipeData")}
                      </Button>
                    </div>
                    {wipeAsk ? (
                      <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/40">
                        <p className="text-sm">{t("settings.wipeConfirm")}</p>
                        <ConfirmBar
                          onCancel={() => setWipeAsk(false)}
                          onConfirm={async () => {
                            setWiping(true);
                            try {
                              await wipeAllBusinessData();
                              setWipeAsk(false);
                              toast(t("settings.wiped"));
                            } catch (e) {
                              toast((e as Error).message, "err");
                            } finally {
                              setWiping(false);
                            }
                          }}
                        />
                      </div>
                    ) : null}
                    <p className="mt-2 text-xs text-navy-500">
                      {t("settings.wipeDataHint")}
                    </p>
                  </Card>
                ) : null}
                {can("backup.manage") ? <BackupRestore /> : null}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function BackupRestore() {
  const { t } = useTranslation();
  const { toast } = useApp();
  const [list, setList] = useState<
    { name: string; path: string; mtime: string }[]
  >([]);
  useEffect(() => {
    invoke<typeof list>("backup:list")
      .then(setList)
      .catch(() => undefined);
  }, []);
  return (
    <Card>
      <h3 className="mb-3 font-bold">{t("settings.backup")}</h3>
      <Button
        className="mb-3"
        variant="outline"
        onClick={async () => {
          const r = await invoke<{ file: string; canceled?: boolean }>(
            "backup:createToDir",
          );
          if (r?.canceled) return;
          toast(t("settings.backupSaved", { file: r.file }));
          const next = await invoke<typeof list>("backup:list").catch(
            () => list,
          );
          setList(next);
        }}
      >
        {t("settings.backupToDisk")}
      </Button>
      <Button
        className="mb-3 ms-2"
        variant="outline"
        onClick={async () => {
          if (!confirm(t("settings.restoreFromFileConfirm"))) return;
          try {
            const r = await invoke<{ canceled?: boolean }>(
              "backup:restoreFromFile",
            );
            if (r?.canceled) return;
            toast(t("settings.restored"));
          } catch (e) {
            toast((e as Error).message, "err");
          }
        }}
      >
        {t("settings.importBackup")}
      </Button>
      <Button
        className="mb-3 ms-2"
        variant="gold"
        onClick={async () => {
          const r = await invoke<{ canceled?: boolean }>("print:backupGuide");
          if (!r?.canceled) toast(t("savedOk"));
        }}
      >
        {t("settings.downloadBackupGuide")}
      </Button>
      {list.map((b) => (
        <div
          key={b.path}
          className="flex items-center justify-between border-b py-2 text-sm"
        >
          <span>
            {b.name} — {b.mtime.slice(0, 16)}
          </span>
          <Button
            variant="outline"
            onClick={async () => {
              if (!confirm(t("settings.restoreConfirm"))) return;
              await invoke("backup:restore", b.path);
              toast(t("settings.restored"));
            }}
          >
            {t("restore")}
          </Button>
        </div>
      ))}
    </Card>
  );
}
