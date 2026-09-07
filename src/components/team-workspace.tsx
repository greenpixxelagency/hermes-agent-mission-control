"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AtSign,
  Bot,
  CircleDot,
  Clock3,
  Eye,
  MessageCircle,
  Monitor,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  WandSparkles,
  X,
} from "lucide-react";
import {
  Avatar,
  EmptyState,
  Metric,
  PageHeader,
  StatusPill,
  TactileButton,
} from "@/components/rogeros-ui";

type Runtime = {
  active: boolean;
  profileKey: string;
  assignmentState: string;
  provisioningState: string;
  reconciliationState: string;
  runtimeStatus: string | null;
  desiredModelId: string | null;
  desiredModelProvider: string | null;
  externalRuntimeMetadata: {
    routines?: Array<{ id: string; name: string; enabled: boolean }>;
  } | null;
};
type Employee = {
  id: string;
  roleOverride: string | null;
  employee: { name: string; role: string; description: string | null };
  skillAssignments: Array<{ skill: { id: string; name: string } }>;
  runtimeAssignments: Runtime[];
  _count: { taskAssignments: number };
};
type Profile = {
  profileId: string;
  displayName: string;
  description: string | null;
  state: string;
  modelProvider: string | null;
  modelId: string | null;
};
type Message = {
  id: string;
  body: string;
  authorSystemIdentity: string | null;
};
type RosterBot = { profile: Profile; employee?: Employee; runtime?: Runtime };
type Project = { id: string; name: string; slug: string; role: string };
type Capabilities = {
  browser: { viewerLease: boolean; takeover: boolean };
  teach: { observation: boolean };
  model: {
    catalog: boolean;
    approved: Array<{ provider: string; modelId: string }>;
  };
  mcp: { managed: boolean };
  routines: { managed: boolean };
  runtime: { gatewayRestart: boolean };
};
const unavailableCapabilities: Capabilities = {
  browser: { viewerLease: false, takeover: false },
  teach: { observation: false },
  model: { catalog: false, approved: [] },
  mcp: { managed: false },
  routines: { managed: false },
  runtime: { gatewayRestart: false },
};
const normalizeCapabilities = (value: unknown): Capabilities => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return unavailableCapabilities;
  const record = value as Record<string, unknown>;
  const section = (key: string) =>
    record[key] &&
    typeof record[key] === "object" &&
    !Array.isArray(record[key])
      ? (record[key] as Record<string, unknown>)
      : {};
  const browser = section("browser");
  const teach = section("teach");
  const model = section("model");
  const mcp = section("mcp");
  const routines = section("routines");
  const runtime = section("runtime");
  return {
    browser: {
      viewerLease: browser.viewerLease === true,
      takeover: browser.takeover === true && browser.viewerLease === true,
    },
    teach: { observation: teach.observation === true },
    model: {
      catalog: model.catalog === true,
      approved: Array.isArray(model.approved)
        ? model.approved.flatMap((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item))
              return [];
            const option = item as Record<string, unknown>;
            return typeof option.provider === "string" &&
              typeof option.modelId === "string" &&
              option.provider.length > 0 &&
              option.provider.length <= 120 &&
              option.modelId.length > 0 &&
              option.modelId.length <= 240
              ? [{ provider: option.provider, modelId: option.modelId }]
              : [];
          })
        : [],
    },
    mcp: { managed: mcp.managed === true },
    routines: { managed: routines.managed === true },
    runtime: { gatewayRestart: runtime.gatewayRestart === true },
  };
};
const managers = new Set(["OWNER", "ADMIN"]);
const operators = new Set(["OWNER", "ADMIN", "OPERATOR"]);
const status = (r?: Runtime) =>
  !r
    ? "Needs assignment"
    : r.assignmentState === "SUSPENDED"
      ? "Paused"
      : r.provisioningState === "FAILED" || r.reconciliationState === "FAILED"
        ? "Needs attention"
        : r.runtimeStatus === "HEALTHY" || r.reconciliationState === "IN_SYNC"
          ? "Online"
          : "Connecting";
const tone = (r?: Runtime): "good" | "warn" | "bad" | "neutral" =>
  status(r) === "Online"
    ? "good"
    : status(r) === "Needs attention"
      ? "bad"
      : r
        ? "warn"
        : "neutral";
const mention = (bot: RosterBot) =>
  `@${bot.profile.displayName.replace(/\s+/g, "")}`;
const activeMentionQuery = (value: string) => {
  const match = value.match(/(?:^|\s)@([^\s@]*)$/);
  return match ? match[1].toLocaleLowerCase() : null;
};

export function TeamWorkspace({ project }: { project: Project }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [mentionedIds, setMentionedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [settings, setSettings] = useState(false);
  const [addBot, setAddBot] = useState(false);
  const [importBot, setImportBot] = useState<RosterBot | null>(null);
  const [adoptProfile, setAdoptProfile] = useState(false);
  const [capabilities, setCapabilities] = useState<Capabilities>(
    unavailableCapabilities,
  );
  const [error, setError] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const canManage = managers.has(project.role);
  const canOperate = operators.has(project.role);
  const load = useCallback(async () => {
    const q = `projectId=${encodeURIComponent(project.id)}`;
    const [workforce, inventory] = await Promise.all([
      fetch(`/api/workforce?${q}`),
      fetch(`/api/runtime/bots?${q}`),
    ]);
    if (!workforce.ok)
      throw Error("Your project workforce could not be loaded.");
    setEmployees((await workforce.json()).employees);
    if (inventory.ok) setProfiles((await inventory.json()).bots);
    else
      setError(
        "Hermes roster is temporarily unavailable. Existing RogerOS assignments remain visible; retry when the protected adapter is healthy.",
      );
  }, [project.id]);
  const roster = useMemo<RosterBot[]>(() => {
    const assigned = new Map(
      employees.flatMap((employee) =>
        employee.runtimeAssignments.map(
          (runtime) => [runtime.profileKey, { employee, runtime }] as const,
        ),
      ),
    );
    const reported = profiles.map((profile) => ({
      profile,
      ...assigned.get(profile.profileId),
    }));
    const known = new Set(reported.map((bot) => bot.profile.profileId));
    const retained = employees
      .flatMap((employee) =>
        employee.runtimeAssignments.map((runtime) => ({
          profile: {
            profileId: runtime.profileKey,
            displayName: employee.employee.name,
            description: employee.employee.description,
            state: runtime.assignmentState,
            modelProvider: runtime.desiredModelProvider,
            modelId: runtime.desiredModelId,
          },
          employee,
          runtime,
        })),
      )
      .filter((bot) => !known.has(bot.profile.profileId));
    return [...reported, ...retained].sort((a, b) =>
      a.profile.displayName.localeCompare(b.profile.displayName),
    );
  }, [employees, profiles]);
  const selected =
    roster.find((bot) => bot.profile.profileId === selectedId) || roster[0];
  const selectedEmployeeId = selected?.employee?.id;
  const mentionableBots = useMemo(
    () =>
      roster.filter(
        (bot) =>
          bot.employee &&
          bot.employee.id !== selectedEmployeeId &&
          bot.runtime?.active,
      ),
    [roster, selectedEmployeeId],
  );
  const mentionQuery = activeMentionQuery(message);
  const matchingMentionBots =
    mentionQuery === null
      ? []
      : mentionableBots.filter((bot) =>
          `${mention(bot).slice(1)} ${bot.profile.displayName}`
            .toLocaleLowerCase()
            .includes(mentionQuery),
        );
  const loadChat = useCallback(
    async (id: string) => {
      const r = await fetch(
        `/api/runtime/bots/chat?projectId=${encodeURIComponent(project.id)}&employeeProjectAssignmentId=${encodeURIComponent(id)}`,
      );
      setMessages(r.ok ? (await r.json()).messages : []);
    },
    [project.id],
  );
  useEffect(() => {
    void load()
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Roster unavailable."),
      )
      .finally(() => setLoading(false));
  }, [load]);
  useEffect(() => {
    if (selectedEmployeeId) void loadChat(selectedEmployeeId);
    else setMessages([]);
    setMentionedIds([]);
  }, [selectedEmployeeId, loadChat]);
  useEffect(() => {
    if (!selectedEmployeeId) {
      setCapabilities(unavailableCapabilities);
      return;
    }
    const controller = new AbortController();
    void fetch(
      `/api/runtime/bots/capabilities?projectId=${encodeURIComponent(project.id)}&employeeProjectAssignmentId=${encodeURIComponent(selectedEmployeeId)}`,
      { signal: controller.signal },
    )
      .then(async (response) =>
        response.ok
          ? response.json().then(normalizeCapabilities)
          : unavailableCapabilities,
      )
      .then((value) => {
        if (!controller.signal.aborted) setCapabilities(value);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setCapabilities(unavailableCapabilities);
      });
    return () => controller.abort();
  }, [project.id, selectedEmployeeId]);
  useEffect(() => {
    const refresh = () => void load().catch(() => undefined);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [load]);
  const tag = (bot: RosterBot) => {
    if (
      !bot.employee ||
      !selected?.employee ||
      bot.employee.id === selected.employee.id
    )
      return;
    setMentionedIds((old) =>
      old.includes(bot.employee!.id) ? old : [...old, bot.employee!.id],
    );
    setMessage((old) => {
      if (old.includes(mention(bot))) return old;
      const typedAt = old.match(/(?:^|\s)@[^\s@]*$/);
      if (typedAt) {
        const prefix = old.slice(0, old.length - typedAt[0].length);
        return `${prefix}${typedAt[0].startsWith(" ") ? " " : ""}${mention(bot)} `;
      }
      return `${old}${old && !old.endsWith(" ") ? " " : ""}${mention(bot)} `;
    });
    requestAnimationFrame(() => input.current?.focus());
  };
  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected?.employee || !selected.runtime?.active || !message.trim())
      return;
    setSending(true);
    setError("");
    try {
      const r = await fetch("/api/runtime/bots/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          employeeProjectAssignmentId: selected.employee.id,
          message,
          mentionedEmployeeProjectAssignmentIds: mentionedIds,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok)
        throw Error(data.error || "Hermes could not complete this message.");
      setMessage("");
      setMentionedIds([]);
      await Promise.all([loadChat(selected.employee.id), load()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Message failed.");
    } finally {
      setSending(false);
    }
  };
  const lifecycle = async (
    action: "suspend" | "resume" | "reconcile" | "retire",
  ) => {
    if (!selected?.employee) return;
    const endpoint =
      action === "retire"
        ? `/api/workforce/${selected.employee.id}/employment`
        : action === "reconcile"
          ? "/api/runtime/bots/reconcile"
          : "/api/runtime/bots/state";
    const body =
      action === "retire"
        ? { projectId: project.id, action }
        : action === "reconcile"
          ? {
              projectId: project.id,
              employeeProjectAssignmentId: selected.employee.id,
            }
          : {
              projectId: project.id,
              employeeProjectAssignmentId: selected.employee.id,
              action,
            };
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok)
      setError((await r.json().catch(() => ({}))).error || "Action failed.");
    else {
      setSettings(false);
      await load();
    }
  };
  const setModel = async (model: { provider: string; modelId: string }) => {
    if (!selected?.employee) return;
    setError("");
    const response = await fetch("/api/runtime/bots/model", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: project.id,
        employeeProjectAssignmentId: selected.employee.id,
        provider: model.provider,
        modelId: model.modelId,
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "Model could not be changed.");
    }
    await load();
  };
  return (
    <div className="hq-rise">
      <PageHeader
        eyebrow={`${project.name} · Hermes control desk`}
        title="Your AI team"
        description="A focused single-workspace experience. RogerOS still carries the hidden project boundary for every bot, tool, browser session, schedule, approval, and audit event."
        action={
          <div className="flex gap-2">
            <TactileButton
              variant="secondary"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 px-3 text-xs"
            >
              <RefreshCw className="w-3.5" />
              Refresh
            </TactileButton>
            {canManage && (
              <>
                <TactileButton
                  variant="secondary"
                  onClick={() => setAdoptProfile(true)}
                  className="inline-flex items-center gap-2 px-3 text-xs"
                >
                  <Bot className="w-3.5" />
                  Adopt profile
                </TactileButton>
                <TactileButton
                  onClick={() => setAddBot(true)}
                  className="inline-flex items-center gap-2 px-3 text-xs"
                >
                  <Plus className="w-3.5" />
                  Add bot
                </TactileButton>
              </>
            )}
          </div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="Hermes bots"
          value={roster.length}
          hint="Bound to this workspace"
        />
        <Metric
          label="Online now"
          value={
            roster.filter((bot) => status(bot.runtime) === "Online").length
          }
          hint="Observed runtime assignments"
          tone="good"
        />
        <Metric
          label="Open work"
          value={employees.reduce(
            (sum, e) => sum + e._count.taskAssignments,
            0,
          )}
          hint="Assigned through RogerOS"
        />
      </div>
      {error && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-[var(--gp-danger)]"
        >
          {error}
        </div>
      )}
      <div className="mt-6 grid min-h-[700px] overflow-hidden rounded-[20px] border border-[var(--gp-line)] bg-[var(--gp-surface)] xl:grid-cols-[290px_minmax(0,1fr)_minmax(340px,.76fr)]">
        <aside className="border-b border-[var(--gp-line)] p-3 xl:border-b-0 xl:border-r">
          <div className="mb-3 flex items-center justify-between px-2">
            <p className="eyebrow">Active roster</p>
            <Users className="w-4 text-[var(--gp-faint)]" />
          </div>
          {loading ? (
            <div className="space-y-2">
              <div className="sk h-16" />
              <div className="sk h-16" />
            </div>
          ) : roster.length ? (
            roster.map((bot) => (
              <button
                key={bot.profile.profileId}
                onClick={() => {
                  setSelectedId(bot.profile.profileId);
                  setSettings(false);
                }}
                className={`mb-1.5 w-full rounded-xl border p-3 text-left transition active:scale-[.975] ${selected?.profile.profileId === bot.profile.profileId ? "border-[var(--gp-accent)] bg-[var(--gp-accent-soft)]" : "border-transparent hover:border-[var(--gp-line)] hover:bg-[var(--gp-accent-soft)]"}`}
              >
                <div className="flex items-center gap-2.5">
                  <Avatar name={bot.profile.displayName} />
                  <span className="min-w-0 flex-1">
                    <strong className="block text-[12px]">
                      {bot.profile.displayName}
                    </strong>
                    <span className="block text-[10px] text-[var(--gp-muted)]">
                      {bot.employee?.roleOverride ||
                        bot.employee?.employee.role ||
                        "Hermes profile"}
                    </span>
                  </span>
                </div>
                <span className="mt-2 flex items-center gap-1 text-[9px] text-[var(--gp-faint)]">
                  <CircleDot className="h-2.5 w-2.5" />
                  {status(bot.runtime)}
                  {bot.employee
                    ? ` · ${bot.employee._count.taskAssignments} assigned`
                    : " · Needs import"}
                </span>
              </button>
            ))
          ) : (
            <EmptyState
              icon={<Bot />}
              title="No bots yet"
              description="Add a governed bot to create an employee and Hermes runtime assignment."
              action={
                canManage ? (
                  <TactileButton
                    onClick={() => setAddBot(true)}
                    className="px-3 text-xs"
                  >
                    Add bot
                  </TactileButton>
                ) : undefined
              }
            />
          )}
        </aside>
        <section className="flex min-w-0 flex-col border-b border-[var(--gp-line)] xl:border-b-0 xl:border-r">
          {selected ? (
            <>
              <header className="flex items-center gap-3 border-b border-[var(--gp-line)] px-5 py-4">
                <Avatar name={selected.profile.displayName} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold">
                      {selected.profile.displayName}
                    </h2>
                    <StatusPill tone={tone(selected.runtime)}>
                      {status(selected.runtime)}
                    </StatusPill>
                  </div>
                  <p className="mt-1 break-all text-[10px] text-[var(--gp-faint)]">
                    Hermes profile · {selected.profile.profileId}
                  </p>
                </div>
                <button
                  onClick={() => setSettings(true)}
                  aria-label="Open profile settings"
                  className="rogeros-tactile-button grid min-h-11 min-w-11 place-items-center rounded-xl border border-[var(--gp-line)]"
                >
                  <Settings2 className="h-4 w-4" />
                </button>
              </header>
              <div className="flex-1 space-y-4 overflow-y-auto p-5">
                {selected.employee ? (
                  messages.length ? (
                    messages.map((item) => (
                      <article
                        key={item.id}
                        className={`flex gap-2.5 ${item.authorSystemIdentity ? "" : "flex-row-reverse"}`}
                      >
                        <Avatar
                          name={
                            item.authorSystemIdentity
                              ? selected.profile.displayName
                              : "You"
                          }
                          size="sm"
                        />
                        <div
                          className={`max-w-[82%] rounded-2xl px-3 py-2.5 text-[12px] leading-5 ${item.authorSystemIdentity ? "bg-[var(--gp-accent-soft)]" : "bg-[var(--gp-accent)] text-white"}`}
                        >
                          {item.body}
                        </div>
                      </article>
                    ))
                  ) : (
                    <EmptyState
                      icon={<MessageCircle />}
                      title={`Talk to ${selected.profile.displayName}`}
                      description="Use @ to invite another active project bot into this controlled coordination turn."
                    />
                  )
                ) : (
                  <EmptyState
                    icon={<ShieldCheck />}
                    title="Profile needs a RogerOS assignment"
                    description="Chat, tools, browser access, schedules, and teach mode remain disabled until an Owner or Admin imports this profile."
                    action={
                      canManage ? (
                        <TactileButton
                          onClick={() => setImportBot(selected)}
                          className="px-3 text-xs"
                        >
                          Import profile
                        </TactileButton>
                      ) : undefined
                    }
                  />
                )}
              </div>
              {selected.employee && (
                <form
                  onSubmit={send}
                  className="border-t border-[var(--gp-line)] p-4"
                >
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--gp-line)] px-2 py-1 text-[10px] text-[var(--gp-muted)]">
                      <AtSign className="h-3 w-3" />
                      Invite bots
                    </span>
                    {mentionableBots.map((bot) => (
                        <button
                          key={bot.profile.profileId}
                          type="button"
                          onClick={() => tag(bot)}
                          className={`rounded-full border px-2 py-1 text-[10px] ${mentionedIds.includes(bot.employee!.id) ? "border-[var(--gp-accent)] bg-[var(--gp-accent-soft)] text-[var(--gp-accent)]" : "border-[var(--gp-line)] text-[var(--gp-muted)]"}`}
                        >
                          {mention(bot)}
                        </button>
                      ))}
                  </div>
                  <textarea
                    ref={input}
                    aria-label={`Message ${selected.profile.displayName}`}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={`Give ${selected.profile.displayName} a task, or type @ to involve another bot…`}
                    className="min-h-20 w-full resize-none rounded-xl border border-[var(--gp-line)] bg-[var(--gp-surface)] p-3 text-[12px]"
                  />
                  {mentionQuery !== null && (
                    <div
                      aria-label="Bot mention suggestions"
                      className="mt-2 rounded-xl border border-[var(--gp-line)] bg-[var(--gp-surface)] p-2"
                    >
                      {matchingMentionBots.length ? (
                        matchingMentionBots.map((bot) => (
                          <button
                            key={`mention-${bot.profile.profileId}`}
                            type="button"
                            onClick={() => tag(bot)}
                            className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs hover:bg-[var(--gp-accent-soft)]"
                          >
                            <span>{mention(bot)}</span>
                            <span className="text-[10px] text-[var(--gp-muted)]">
                              {bot.profile.displayName}
                            </span>
                          </button>
                        ))
                      ) : (
                        <p className="px-2 py-1 text-[10px] text-[var(--gp-muted)]">
                          No other active project bot matches this mention.
                        </p>
                      )}
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-[9px] text-[var(--gp-faint)]">
                      {mentionedIds.length
                        ? `${mentionedIds.length} bot${mentionedIds.length === 1 ? "" : "s"} will provide a bounded brief`
                        : "Hermes-routed · retained in RogerOS"}
                    </span>
                    <TactileButton
                      disabled={
                        !canOperate ||
                        sending ||
                        !message.trim() ||
                        !selected.runtime?.active
                      }
                      type="submit"
                      className="inline-flex items-center gap-2 px-3 text-[11px]"
                    >
                      <Send className="w-3" />
                      {sending ? "Working…" : "Send"}
                    </TactileButton>
                  </div>
                </form>
              )}
            </>
          ) : (
            <EmptyState
              icon={<Bot />}
              title="Choose a Hermes bot"
              description="Select a bot to open its chat and browser workspace."
            />
          )}
        </section>
        <BrowserEnvironment bot={selected} capabilities={capabilities} />
      </div>
      {settings && selected && (
        <Settings
          bot={selected}
          canManage={canManage}
          capabilities={capabilities}
          close={() => setSettings(false)}
          lifecycle={lifecycle}
          setModel={setModel}
        />
      )}{" "}
      {addBot && (
        <AddBot
          project={project}
          close={() => setAddBot(false)}
          done={async () => {
            setAddBot(false);
            await load();
          }}
        />
      )}
      {adoptProfile && (
        <AdoptProfile
          project={project}
          close={() => setAdoptProfile(false)}
          done={async () => {
            setAdoptProfile(false);
            await load();
          }}
        />
      )}
      {importBot && (
        <ImportBot
          project={project}
          bot={importBot}
          close={() => setImportBot(null)}
          done={async () => {
            setImportBot(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function BrowserEnvironment({
  bot,
  capabilities,
}: {
  bot?: RosterBot;
  capabilities: Capabilities;
}) {
  return (
    <aside className="flex min-h-72 flex-col bg-[color-mix(in_srgb,var(--gp-accent)_3%,var(--gp-surface))] p-4">
      {bot ? (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Browser environment</p>
              <h3 className="mt-2 text-sm font-semibold">
                {bot.profile.displayName}&apos;s browser
              </h3>
            </div>
            <StatusPill
              tone={capabilities.browser.viewerLease ? "accent" : "neutral"}
            >
              {capabilities.browser.viewerLease
                ? "Viewer capability reported"
                : "Protected setup required"}
            </StatusPill>
          </div>
          <div className="mt-5 flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--gp-line-strong)] bg-[var(--gp-surface)] p-6 text-center">
            <Monitor className="h-6 w-6 text-[var(--gp-accent)]" />
            <p className="mt-4 text-sm font-semibold">
              Browser environment is preparing
            </p>
            <p className="mt-2 text-[11px] leading-5 text-[var(--gp-muted)]">
              Each bot gets an isolated Hermes browser. RogerOS will render it
              only through a short-lived protected viewer lease—never a shared
              desktop or exposed VNC address.
            </p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <TactileButton
              disabled
              variant="secondary"
              className="inline-flex items-center justify-center gap-2 px-2 text-[11px]"
            >
              <Eye className="h-3.5 w-3.5" />
              Watch
            </TactileButton>
            <TactileButton
              disabled
              variant="secondary"
              className="inline-flex items-center justify-center gap-2 px-2 text-[11px]"
            >
              <Radio className="h-3.5 w-3.5" />
              Take over
            </TactileButton>
          </div>
          <p className="mt-3 text-[10px] text-[var(--gp-faint)]">
            Take over is disabled until the adapter proves exclusive human
            control.
          </p>
        </>
      ) : (
        <EmptyState
          icon={<Monitor />}
          title="Browser environment"
          description="Select a Hermes bot to inspect its workspace."
        />
      )}
    </aside>
  );
}
function Settings({
  bot,
  canManage,
  capabilities,
  close,
  lifecycle,
  setModel,
}: {
  bot: RosterBot;
  canManage: boolean;
  capabilities: Capabilities;
  close: () => void;
  lifecycle: (a: "suspend" | "resume" | "reconcile" | "retire") => void;
  setModel: (model: { provider: string; modelId: string }) => Promise<void>;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const routines = bot.runtime?.externalRuntimeMetadata?.routines || [];
  const [modelSaving, setModelSaving] = useState(false);
  const [modelError, setModelError] = useState("");
  const currentModel =
    bot.runtime?.desiredModelProvider && bot.runtime.desiredModelId
      ? `${bot.runtime.desiredModelProvider}:${bot.runtime.desiredModelId}`
      : bot.profile.modelProvider && bot.profile.modelId
        ? `${bot.profile.modelProvider}:${bot.profile.modelId}`
        : "";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onKeyDown={(e) => e.key === "Escape" && close()}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 backdrop-blur-sm sm:items-center"
    >
      <section className="glass-panel max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl p-5">
        <header className="flex justify-between">
          <div>
            <p className="eyebrow">Hermes bot profile</p>
            <h2
              id="settings-title"
              className="mt-1 font-display text-xl font-extrabold"
            >
              {bot.profile.displayName}
            </h2>
          </div>
          <button
            ref={ref}
            onClick={close}
            aria-label="Close settings"
            className="rogeros-tactile-button grid min-h-11 min-w-11 place-items-center rounded-xl border border-[var(--gp-line)]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <p className="mt-3 text-sm text-[var(--gp-muted)]">
          RogerOS governs this profile. Runtime configuration never grants Tool
          permission or bypasses approval.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Card label="Profile" value={bot.profile.profileId} />
          <Card
            label="Model"
            value={
              bot.profile.modelId ||
              bot.runtime?.desiredModelId ||
              (capabilities.model.catalog
                ? "Approved catalog available"
                : "Adapter-managed")
            }
          />
          <Card
            label="Role"
            value={
              bot.employee?.roleOverride ||
              bot.employee?.employee.role ||
              "Not assigned"
            }
          />
          <Card
            label="Approved skills"
            value={`${bot.employee?.skillAssignments.length || 0} assigned`}
          />
        </div>
        <section className="mt-4 rounded-xl border border-[var(--gp-line)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <strong className="text-xs">Approved model</strong>
              <p className="mt-1 text-[11px] text-[var(--gp-muted)]">
                Only models advertised by this bot&apos;s signed Hermes binding
                can be selected.
              </p>
            </div>
            <select
              aria-label="Approved model"
              disabled={
                !canManage ||
                !bot.employee ||
                !capabilities.model.catalog ||
                modelSaving ||
                !capabilities.model.approved.length
              }
              value={currentModel}
              onChange={(event) => {
                const selected = capabilities.model.approved.find(
                  (item) =>
                    `${item.provider}:${item.modelId}` === event.target.value,
                );
                if (!selected) return;
                setModelError("");
                setModelSaving(true);
                void setModel(selected)
                  .catch((cause) =>
                    setModelError(
                      cause instanceof Error
                        ? cause.message
                        : "Model could not be changed.",
                    ),
                  )
                  .finally(() => setModelSaving(false));
              }}
              className="max-w-full rounded-lg border border-[var(--gp-line)] bg-[var(--gp-surface)] px-2 py-2 text-[11px]"
            >
              {!currentModel && <option value="">Choose approved model</option>}
              {capabilities.model.approved.map((item) => (
                <option
                  key={`${item.provider}:${item.modelId}`}
                  value={`${item.provider}:${item.modelId}`}
                >
                  {item.provider} / {item.modelId}
                </option>
              ))}
            </select>
          </div>
          {modelError && (
            <p role="alert" className="mt-3 text-xs text-[var(--gp-danger)]">
              {modelError}
            </p>
          )}
        </section>
        <section className="mt-4 rounded-xl border border-[var(--gp-line)] p-4">
          <div className="flex gap-2">
            <Sparkles className="h-4 w-4 text-[var(--gp-accent)]" />
            <strong className="text-xs">Skills, tools, and MCP</strong>
          </div>
          <p className="mt-2 text-[11px] text-[var(--gp-muted)]">
            Skills are governed in the library. Tools and MCP are managed in
            Tools; no capability or credential is granted automatically.
          </p>
        </section>
        <section className="mt-3 rounded-xl border border-[var(--gp-line)] p-4">
          <div className="flex gap-2">
            <Clock3 className="h-4 w-4 text-[var(--gp-accent)]" />
            <strong className="text-xs">Schedules and routines</strong>
          </div>
          <p className="mt-2 text-[11px] text-[var(--gp-muted)]">
            {routines.length
              ? `${routines.length} observed routine(s).`
              : capabilities.routines.managed
                ? "Managed routine capability reported; schedule controls are awaiting the adapter action endpoint."
                : "No observed routines yet. Creation awaits the protected adapter’s bounded schedule contract."}
          </p>
        </section>
        <section className="mt-3 rounded-xl border border-[var(--gp-line)] bg-[var(--gp-accent-soft)] p-4">
          <div className="flex gap-2">
            <WandSparkles className="h-4 w-4 text-[var(--gp-accent)]" />
            <strong className="text-xs">Teach by observation</strong>
          </div>
          <p className="mt-2 text-[11px] text-[var(--gp-muted)]">
            {capabilities.teach.observation
              ? "The adapter reports bounded observation support. RogerOS will still require review before any learned skill is assigned."
              : "Recording will be enabled only after the browser adapter can redact"}
            {!capabilities.teach.observation &&
              " credentials, scope a session to this bot, and produce a reviewable skill draft. Learning never installs automatically."}
          </p>
          <TactileButton
            disabled
            variant="secondary"
            className="mt-3 px-3 text-[11px]"
          >
            Record a lesson
          </TactileButton>
        </section>
        {canManage && bot.employee && (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--gp-line)] pt-4">
            <TactileButton
              variant="secondary"
              onClick={() => lifecycle("reconcile")}
              className="px-3 text-[11px]"
            >
              <RefreshCw className="mr-1 inline h-3.5 w-3.5" />
              Reconcile
            </TactileButton>
            <TactileButton
              variant="secondary"
              onClick={() =>
                lifecycle(
                  bot.runtime?.assignmentState === "SUSPENDED"
                    ? "resume"
                    : "suspend",
                )
              }
              className="px-3 text-[11px]"
            >
              {bot.runtime?.assignmentState === "SUSPENDED" ? (
                <Play className="mr-1 inline h-3.5 w-3.5" />
              ) : (
                <Pause className="mr-1 inline h-3.5 w-3.5" />
              )}
              {bot.runtime?.assignmentState === "SUSPENDED"
                ? "Resume"
                : "Pause"}
            </TactileButton>
            <TactileButton
              variant="secondary"
              onClick={() => lifecycle("retire")}
              className="px-3 text-[11px] text-[var(--gp-danger)]"
            >
              <Trash2 className="mr-1 inline h-3.5 w-3.5" />
              Remove bot
            </TactileButton>
          </div>
        )}
      </section>
    </div>
  );
}
function AddBot({
  project,
  close,
  done,
}: {
  project: Project;
  close: () => void;
  done: () => Promise<void>;
}) {
  const [name, setName] = useState(""),
    [role, setRole] = useState(""),
    [description, setDescription] = useState(""),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch("/api/runtime/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          name,
          role,
          description,
        }),
      });
      if (!r.ok)
        throw Error(
          (await r.json().catch(() => ({}))).error || "Bot could not be added.",
        );
      await done();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Bot could not be added.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 backdrop-blur-sm sm:items-center"
    >
      <form
        onSubmit={submit}
        className="glass-panel w-full max-w-lg rounded-2xl p-5"
      >
        <header className="flex justify-between">
          <div>
            <p className="eyebrow">New Hermes employee</p>
            <h2 className="mt-1 font-display text-xl font-extrabold">
              Add a bot
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            className="rogeros-tactile-button grid min-h-11 min-w-11 place-items-center rounded-xl border border-[var(--gp-line)]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <p className="mt-3 text-[11px] text-[var(--gp-muted)]">
          RogerOS creates the employee and project-bound runtime assignment. The
          profile is live only after Hermes reconciliation succeeds.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-xs text-[var(--gp-danger)]">
            {error}
          </p>
        )}
        <label className="mt-4 block text-xs font-semibold">
          Name
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-[var(--gp-line)] bg-[var(--gp-surface)] px-3 py-2.5"
          />
        </label>
        <label className="mt-3 block text-xs font-semibold">
          Role
          <input
            required
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-[var(--gp-line)] bg-[var(--gp-surface)] px-3 py-2.5"
          />
        </label>
        <label className="mt-3 block text-xs font-semibold">
          Mission
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1.5 min-h-20 w-full rounded-xl border border-[var(--gp-line)] bg-[var(--gp-surface)] p-3"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <TactileButton
            type="button"
            variant="secondary"
            onClick={close}
            className="px-3 text-xs"
          >
            Cancel
          </TactileButton>
          <TactileButton
            disabled={saving || !name.trim() || !role.trim()}
            type="submit"
            className="px-3 text-xs"
          >
            {saving ? "Adding…" : "Add governed bot"}
          </TactileButton>
        </div>
      </form>
    </div>
  );
}
function AdoptProfile({
  project,
  close,
  done,
}: {
  project: Project;
  close: () => void;
  done: () => Promise<void>;
}) {
  const [profileId, setProfileId] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/runtime/bots/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          profileId,
          name,
          role,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Profile could not be adopted.");
      }
      await done();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Profile could not be adopted.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="adopt-profile-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 backdrop-blur-sm sm:items-center"
    >
      <form
        onSubmit={submit}
        className="glass-panel w-full max-w-lg rounded-2xl p-5"
      >
        <header className="flex justify-between gap-4">
          <div>
            <p className="eyebrow">Existing Hermes profile</p>
            <h2
              id="adopt-profile-title"
              className="mt-1 font-display text-xl font-extrabold"
            >
              Adopt a profile
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close profile adoption"
            className="rogeros-tactile-button grid min-h-11 min-w-11 place-items-center rounded-xl border border-[var(--gp-line)]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <p className="mt-3 text-[11px] leading-5 text-[var(--gp-muted)]">
          Enter the exact Hermes profile ID. RogerOS binds it with this
          workspace&apos;s opaque IDs; Hermes rejects an unavailable or
          already-bound profile. This grants no tools, browser, MCP, schedule,
          or approval access.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-xs text-[var(--gp-danger)]">
            {error}
          </p>
        )}
        <label className="mt-4 block text-xs font-semibold">
          Hermes profile ID
          <input
            required
            pattern="[A-Za-z0-9][A-Za-z0-9_.-]{0,120}"
            value={profileId}
            onChange={(event) => setProfileId(event.target.value)}
            placeholder="existing-hermes-profile"
            className="mt-1.5 w-full rounded-xl border border-[var(--gp-line)] bg-[var(--gp-surface)] px-3 py-2.5"
          />
        </label>
        <label className="mt-3 block text-xs font-semibold">
          Employee name
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-[var(--gp-line)] bg-[var(--gp-surface)] px-3 py-2.5"
          />
        </label>
        <label className="mt-3 block text-xs font-semibold">
          RogerOS role
          <input
            required
            value={role}
            onChange={(event) => setRole(event.target.value)}
            placeholder="Operations lead"
            className="mt-1.5 w-full rounded-xl border border-[var(--gp-line)] bg-[var(--gp-surface)] px-3 py-2.5"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <TactileButton
            type="button"
            variant="secondary"
            onClick={close}
            className="px-3 text-xs"
          >
            Cancel
          </TactileButton>
          <TactileButton
            disabled={
              saving || !profileId.trim() || !name.trim() || !role.trim()
            }
            type="submit"
            className="px-3 text-xs"
          >
            {saving ? "Adopting…" : "Adopt governed profile"}
          </TactileButton>
        </div>
      </form>
    </div>
  );
}
function ImportBot({
  project,
  bot,
  close,
  done,
}: {
  project: Project;
  bot: RosterBot;
  close: () => void;
  done: () => Promise<void>;
}) {
  const [role, setRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/runtime/bots/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          profileId: bot.profile.profileId,
          name: bot.profile.displayName,
          role,
          description: bot.profile.description,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Profile could not be imported.");
      }
      await done();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Profile could not be imported.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-bot-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 backdrop-blur-sm sm:items-center"
    >
      <form
        onSubmit={submit}
        className="glass-panel w-full max-w-lg rounded-2xl p-5"
      >
        <header className="flex justify-between gap-4">
          <div>
            <p className="eyebrow">Bound Hermes profile</p>
            <h2
              id="import-bot-title"
              className="mt-1 font-display text-xl font-extrabold"
            >
              Import {bot.profile.displayName}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close profile import"
            className="rogeros-tactile-button grid min-h-11 min-w-11 place-items-center rounded-xl border border-[var(--gp-line)]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <p className="mt-3 text-[11px] leading-5 text-[var(--gp-muted)]">
          RogerOS will adopt only a profile the protected adapter already binds
          to this workspace. Skills, tools, MCP, browser access, schedules, and
          approvals start default-deny.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-xs text-[var(--gp-danger)]">
            {error}
          </p>
        )}
        <label className="mt-4 block text-xs font-semibold">
          RogerOS role
          <input
            required
            value={role}
            onChange={(event) => setRole(event.target.value)}
            placeholder="Operations lead"
            className="mt-1.5 w-full rounded-xl border border-[var(--gp-line)] bg-[var(--gp-surface)] px-3 py-2.5"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <TactileButton
            type="button"
            variant="secondary"
            onClick={close}
            className="px-3 text-xs"
          >
            Cancel
          </TactileButton>
          <TactileButton
            disabled={saving || !role.trim()}
            type="submit"
            className="px-3 text-xs"
          >
            {saving ? "Importing…" : "Import governed profile"}
          </TactileButton>
        </div>
      </form>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--gp-line)] bg-[var(--gp-surface)] p-3">
      <p className="text-[9px] font-semibold uppercase tracking-[.12em] text-[var(--gp-faint)]">
        {label}
      </p>
      <p className="mt-2 break-all text-[11px]">{value}</p>
    </div>
  );
}
