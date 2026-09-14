"use client";

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  AtSign,
  Bot,
  ChevronRight,
  Command,
  FileText,
  Info,
  Mic,
  Monitor,
  Paperclip,
  PanelRight,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Square,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { EmptyState, StatusPill, TactileButton } from "@/components/rogeros-ui";
import {
  composerAction,
  fallbackAvatarPresetKey,
  isTeamAvatarPresetKey,
  teamAvatarPresets,
  type TeamAvatarPresetKey,
} from "@/lib/team-ui-logic";

const BROWSER_UPLOAD_FILE_BYTES = 3_900_000;

type Runtime = {
  active: boolean;
  profileKey: string;
  assignmentState: string;
  provisioningState: string;
  reconciliationState: string;
  runtimeStatus: string | null;
  desiredModelId: string | null;
  desiredModelProvider: string | null;
};
type Employee = {
  id: string;
  roleOverride: string | null;
  avatarPresetKey: TeamAvatarPresetKey | null;
  avatarAssetId: string | null;
  employee: { name: string; role: string; description: string | null };
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
type Asset = {
  id: string;
  kind: string;
  safeName: string;
  mimeType: string;
  byteLength: number;
  durationMs: number | null;
};
type Message = {
  id: string;
  body: string;
  createdAt: string;
  authorUserId: string | null;
  authorSystemIdentity: string | null;
  author?: { name: string | null } | null;
  attachments: Array<{ state: string; errorCode: string | null; asset: Asset }>;
};
type RosterBot = { profile: Profile; employee?: Employee; runtime?: Runtime };
type Project = { id: string; name: string; slug: string; role: string };
type DeskClaim = {
  claimId: string;
  displayName: string;
  role: string | null;
  description: string | null;
};
type Desk = {
  state:
    | "SETUP_REQUIRED"
    | "ADAPTER_UNAVAILABLE"
    | "READY_EMPTY"
    | "ACTIVE_ROSTER"
    | "NEEDS_ATTENTION";
  failureCode: string | null;
  claimFailureCode?: string | null;
  claimableProfiles: DeskClaim[];
  inventory: Profile[];
  allowedActions: { add: boolean; adopt: boolean; retry: boolean };
  retained: Array<{
    employeeAssignmentId: string;
    profileKey: string;
    displayName: string;
    role: string;
    avatarPresetKey: TeamAvatarPresetKey | null;
    avatarAssetId: string | null;
    description: string | null;
    taskCount: number;
    assignmentState: string;
    provisioningState: string;
    reconciliationState: string;
    runtimeStatus: string | null;
    desiredModelProvider: string | null;
    desiredModelId: string | null;
    active: boolean;
  }>;
};
type Capabilities = {
  browser: { viewerLease: boolean; takeover: boolean };
  model: { catalog: boolean };
  voice: {
    available: boolean;
    acceptedMimeTypes?: string[];
    maxBytes?: number;
    maxDurationMs?: number;
  };
};
type StudioData = {
  state: "READY" | "SETUP_REQUIRED" | "UNAVAILABLE" | "ATTENTION";
  failureCode: string | null;
  expectedRevision: number;
  model: { capability: boolean; catalog: { revision: string; models: Array<{ provider: string; modelId: string; displayName: string; state: string }> } | null; observed: { provider: string; modelId: string; fingerprint: string } | null };
  profileFiles: { capability: boolean; observed: Array<{ logicalKey: string; version: number; digest: string; state: string }> };
  skills: { capability: boolean; lifecycle: boolean; observed: Array<{ key: string; version: string; installed: boolean; enabled: boolean }>; catalog: Array<{ id: string; name: string; description: string; version: string; runtimeKey: string }>; assignments: Array<{ skill: { id: string }; state: string }> };
  mcp: { capability: boolean; observed: Array<{ serverKey: string; name: string; healthy: boolean; tools: Array<{ key: string; name: string }> }>; eligibleConnections: Array<{ id: string; name: string }>; assignments: Array<{ serverKey: string; state: string; revision: number; tools: Array<{ toolKey: string; enabled: boolean }> }> };
};
type RawStudioData = {
  overview: { reconciliationState: string; studioConfigRevision: number; observedModelProvider: string | null; observedModelId: string | null };
  capabilities: Record<"model" | "profileFiles" | "skills" | "skillLifecycle" | "mcp", { available: boolean; reason: "READY" | "SETUP_REQUIRED" | "UNAVAILABLE" }>;
  modelCatalog: { revision: string; current: { provider: string; modelId: string; fingerprint: string } | null; models: Array<{ provider: string; modelId: string; displayName: string; setupState: string }> } | null;
  profileFiles: Array<{ logicalKey: string; version: number; digest: string }>;
  skills: Array<{ state: string; skill: { id: string; name: string; description: string; version: string }; observed: { key: string; version: string; installed: boolean; enabled: boolean } | null }>;
  skillCatalog: Array<{ id: string; name: string; description: string; version: string; runtimeKey: string }>;
  observedSkills: Array<{ key: string; version: string; installed: boolean; enabled: boolean }>;
  mcp: { catalog: Array<{ serverKey: string; displayName: string; setupState: string; toolKeys: string[] }>; eligibleConnections: Array<{ id: string; name: string }>; assignments: Array<{ serverKey: string; state: string; revision: number; tools: Array<{ toolKey: string; enabled: boolean }> }> };
};
function normalizeStudio(value: RawStudioData): StudioData {
  const capabilityValues = Object.values(value.capabilities);
  const state = value.overview.reconciliationState === "FAILED" ? "ATTENTION" : capabilityValues.some((item) => item.available) ? "READY" : capabilityValues.every((item) => item.reason === "SETUP_REQUIRED") ? "SETUP_REQUIRED" : "UNAVAILABLE";
  return {
    state, failureCode: state === "READY" ? null : capabilityValues.find((item) => !item.available)?.reason || null, expectedRevision: value.overview.studioConfigRevision,
    model: { capability: value.capabilities.model.available, catalog: value.modelCatalog ? { revision: value.modelCatalog.revision, models: value.modelCatalog.models.map((model) => ({ ...model, state: model.setupState })) } : null, observed: value.modelCatalog?.current || (value.overview.observedModelProvider && value.overview.observedModelId ? { provider: value.overview.observedModelProvider, modelId: value.overview.observedModelId, fingerprint: "server-cas" } : null) },
    profileFiles: { capability: value.capabilities.profileFiles.available, observed: value.profileFiles.map((file) => ({ ...file, state: "READY" })) },
    skills: { capability: value.capabilities.skills.available, lifecycle: value.capabilities.skillLifecycle.available, observed: value.observedSkills, catalog: value.skillCatalog, assignments: value.skills.map((item) => ({ skill: { id: item.skill.id }, state: item.state })) },
    mcp: { capability: value.capabilities.mcp.available, observed: value.mcp.catalog.map((server) => ({ serverKey: server.serverKey, name: server.displayName, healthy: server.setupState === "READY", tools: server.toolKeys.map((key) => ({ key, name: key })) })), eligibleConnections: value.mcp.eligibleConnections, assignments: value.mcp.assignments },
  };
}

const managers = new Set(["OWNER", "ADMIN"]);
const operators = new Set(["OWNER", "ADMIN", "OPERATOR"]);
const deskCopy: Record<Desk["state"], string> = {
  SETUP_REQUIRED:
    "Adapter setup is required. Retained RogerOS assignments remain visible.",
  ADAPTER_UNAVAILABLE:
    "Live status is unavailable. Retained RogerOS assignments remain visible.",
  READY_EMPTY:
    "The protected adapter is ready. Add a governed employee to begin.",
  ACTIVE_ROSTER: "Connected through signed project bindings.",
  NEEDS_ATTENTION: "One or more employees need reconciliation.",
};
const unavailableCapabilities: Capabilities = {
  browser: { viewerLease: false, takeover: false },
  model: { catalog: false },
  voice: { available: false },
};

function runtimeStatus(runtime?: Runtime) {
  if (!runtime) return "Needs assignment";
  if (runtime.assignmentState === "SUSPENDED") return "Paused";
  if (
    runtime.provisioningState === "FAILED" ||
    runtime.reconciliationState === "FAILED"
  )
    return "Needs attention";
  return runtime.runtimeStatus === "HEALTHY" ||
    runtime.reconciliationState === "IN_SYNC"
    ? "Online"
    : "Connecting";
}
function statusTone(runtime?: Runtime): "good" | "warn" | "bad" | "neutral" {
  const value = runtimeStatus(runtime);
  return value === "Online"
    ? "good"
    : value === "Needs attention"
      ? "bad"
      : runtime
        ? "warn"
        : "neutral";
}
function roleFor(bot: RosterBot) {
  return (
    bot.employee?.roleOverride ||
    bot.employee?.employee.role ||
    "Hermes profile"
  );
}
function avatarKey(bot: RosterBot) {
  return isTeamAvatarPresetKey(bot.employee?.avatarPresetKey)
    ? bot.employee.avatarPresetKey
    : fallbackAvatarPresetKey(bot.profile.profileId);
}
function mention(bot: RosterBot) {
  return `@${bot.profile.displayName.replace(/\s+/g, "")}`;
}
function activeMentionQuery(value: string) {
  const match = value.match(/(?:^|\s)@([^\s@]*)$/);
  return match ? match[1].toLocaleLowerCase() : null;
}
function dayLabel(value: string) {
  const date = new Date(value);
  const now = new Date();
  return date.toDateString() === now.toDateString()
    ? "Today"
    : date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
      });
}
function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function AnimalAvatar({
  presetKey,
  name,
  size = "md",
  assetId,
  projectId,
}: {
  presetKey: TeamAvatarPresetKey;
  name: string;
  size?: "sm" | "md" | "lg";
  assetId?: string | null;
  projectId?: string;
}) {
  const preset = teamAvatarPresets.find((item) => item.key === presetKey)!;
  const dimensions =
    size === "sm" ? "h-8 w-8" : size === "lg" ? "h-12 w-12" : "h-10 w-10";
  const ears =
    preset.animal === "rabbit" ? (
      <>
        <ellipse cx="29" cy="17" rx="8" ry="15" />
        <ellipse cx="67" cy="17" rx="8" ry="15" />
      </>
    ) : preset.animal === "owl" ? (
      <>
        <path d="M20 24 29 8l13 18Z" />
        <path d="m54 26 13-18 9 16Z" />
      </>
    ) : (
      <>
        <path d="M21 30 25 9l20 19Z" />
        <path d="m51 28 20-19 4 21Z" />
      </>
    );
  if (assetId && projectId)
    return (
      <span
        className={`${dimensions} shrink-0 rounded-[32%] border border-black/10 bg-cover bg-center shadow-sm`}
        style={{
          backgroundImage: `url(/api/team/assets/${encodeURIComponent(assetId)}?projectId=${encodeURIComponent(projectId)})`,
        }}
        role="img"
        aria-label={`${name}, uploaded avatar`}
        title="Uploaded avatar"
      />
    );
  return (
    <span
      className={`${dimensions} shrink-0 overflow-hidden rounded-[32%] border border-black/10 shadow-sm`}
      role="img"
      aria-label={`${name}, ${preset.name} avatar`}
      title={preset.name}
    >
      <svg viewBox="0 0 96 96" className="h-full w-full" aria-hidden="true">
        <rect width="96" height="96" rx="28" fill={preset.background} />
        <g fill={preset.foreground}>
          {ears}
          <ellipse cx="48" cy="53" rx="31" ry="29" />
        </g>
        <ellipse cx="37" cy="50" rx="4" ry="5" fill="white" />
        <ellipse cx="59" cy="50" rx="4" ry="5" fill="white" />
        <circle cx="37" cy="51" r="2" fill="#172033" />
        <circle cx="59" cy="51" r="2" fill="#172033" />
        <path
          d="M43 64c3 4 7 4 10 0"
          fill="none"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path d="m45 59 3 3 3-3" fill="#172033" />
      </svg>
    </span>
  );
}

export function TeamWorkspace({ project }: { project: Project }) {
  const [employees, setEmployees] = useState<Employee[]>([]),
    [profiles, setProfiles] = useState<Profile[]>([]),
    [desk, setDesk] = useState<Desk | null>(null);
  const [selectedId, setSelectedId] = useState(""),
    [messages, setMessages] = useState<Message[]>([]),
    [message, setMessage] = useState(""),
    [mentionedIds, setMentionedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true),
    [chatLoading, setChatLoading] = useState(false),
    [sending, setSending] = useState(false),
    [working, setWorking] = useState(false),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [mobileView, setMobileView] = useState<"roster" | "chat" | "context">(
      "roster",
    ),
    [contextOpen, setContextOpen] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [modelShell, setModelShell] = useState(false),
    [addBot, setAddBot] = useState(false),
    [adoptProfile, setAdoptProfile] = useState(false);
  const [capabilities, setCapabilities] = useState<Capabilities>(
    unavailableCapabilities,
  );
  const [pendingAssets, setPendingAssets] = useState<Asset[]>([]),
    [uploadingAsset, setUploadingAsset] = useState(false),
    [voiceState, setVoiceState] = useState<
      "idle" | "recording" | "paused" | "review" | "uploading"
    >("idle"),
    [voiceSeconds, setVoiceSeconds] = useState(0);
  const input = useRef<HTMLTextAreaElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    bottom = useRef<HTMLDivElement>(null),
    submitLock = useRef(false),
    composing = useRef(false),
    recorder = useRef<MediaRecorder | null>(null),
    voiceChunks = useRef<Blob[]>([]),
    voiceBlob = useRef<Blob | null>(null),
    voiceTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const canManage = managers.has(project.role),
    canOperate = operators.has(project.role);

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/team/desk?projectId=${encodeURIComponent(project.id)}`,
      { cache: "no-store" },
    );
    if (!response.ok) throw new Error("Your project Team could not be loaded.");
    const next = (await response.json()) as Desk;
    setDesk(next);
    setProfiles(next.inventory || []);
    setEmployees(
      next.retained.map((row) => ({
        id: row.employeeAssignmentId,
        roleOverride: row.role,
        avatarPresetKey: row.avatarPresetKey,
        avatarAssetId: row.avatarAssetId,
        employee: {
          name: row.displayName,
          role: row.role,
          description: row.description,
        },
        runtimeAssignments: [
          {
            active: row.active,
            profileKey: row.profileKey,
            assignmentState: row.assignmentState,
            provisioningState: row.provisioningState,
            reconciliationState: row.reconciliationState,
            runtimeStatus: row.runtimeStatus,
            desiredModelId: row.desiredModelId,
            desiredModelProvider: row.desiredModelProvider,
          },
        ],
        _count: { taskAssignments: row.taskCount },
      })),
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
  const filteredRoster = roster.filter((bot) =>
    `${bot.profile.displayName} ${roleFor(bot)}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  const mentionableBots = roster.filter(
    (bot) =>
      bot.employee &&
      bot.employee.id !== selectedEmployeeId &&
      bot.runtime?.active,
  );
  const mentionQuery = activeMentionQuery(message);
  const matchingMentions =
    mentionQuery === null
      ? []
      : mentionableBots.filter((bot) =>
          `${mention(bot)} ${bot.profile.displayName}`
            .toLocaleLowerCase()
            .includes(mentionQuery),
        );

  const loadChat = useCallback(
    async (id: string) => {
      setChatLoading(true);
      try {
        const response = await fetch(
          `/api/runtime/bots/chat?projectId=${encodeURIComponent(project.id)}&employeeProjectAssignmentId=${encodeURIComponent(id)}`,
          { cache: "no-store" },
        );
        if (!response.ok)
          throw new Error("Conversation history is unavailable.");
        setMessages(
          ((await response.json()) as { messages: Message[] }).messages,
        );
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Conversation history is unavailable.",
        );
      } finally {
        setChatLoading(false);
      }
    },
    [project.id],
  );
  useEffect(() => {
    void load()
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : "Team unavailable."),
      )
      .finally(() => setLoading(false));
  }, [load]);
  useEffect(() => {
    if (selectedEmployeeId) void loadChat(selectedEmployeeId);
    else setMessages([]);
    setMentionedIds([]);
    setPendingAssets([]);
  }, [selectedEmployeeId, loadChat]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, working]);
  useEffect(
    () => () => {
      if (voiceTimer.current) clearInterval(voiceTimer.current);
      recorder.current?.stream.getTracks().forEach((track) => track.stop());
    },
    [],
  );
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
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        if (!controller.signal.aborted)
          setCapabilities({
            browser: {
              viewerLease: value?.browser?.viewerLease === true,
              takeover:
                value?.browser?.viewerLease === true &&
                value?.browser?.takeover === true,
            },
            model: { catalog: value?.model?.catalog === true },
            voice: { available: value?.voice?.available === true },
          });
      })
      .catch(() => setCapabilities(unavailableCapabilities));
    return () => controller.abort();
  }, [project.id, selectedEmployeeId]);

  const selectBot = (bot: RosterBot) => {
    setSelectedId(bot.profile.profileId);
    setMobileView("chat");
    setSettingsOpen(false);
  };
  const tag = (bot: RosterBot) => {
    if (!bot.employee) return;
    setMentionedIds((old) =>
      old.includes(bot.employee!.id) ? old : [...old, bot.employee!.id],
    );
    setMessage((old) => {
      const typed = old.match(/(?:^|\s)@[^\s@]*$/);
      if (typed)
        return `${old.slice(0, old.length - typed[0].length)}${typed[0].startsWith(" ") ? " " : ""}${mention(bot)} `;
      return `${old}${old && !old.endsWith(" ") ? " " : ""}${mention(bot)} `;
    });
    requestAnimationFrame(() => input.current?.focus());
  };
  const openModelShell = () => {
    setMessage("");
    setModelShell(true);
  };
  const uploadDocuments = async (files: FileList | null) => {
    if (!files || !files.length || pendingAssets.length >= 5) return;
    setUploadingAsset(true);
    setError("");
    try {
      for (const file of Array.from(files).slice(0, 5 - pendingAssets.length)) {
        if (!file.size || file.size > BROWSER_UPLOAD_FILE_BYTES)
          throw new Error(`${file.name} exceeds the 3.9 MB upload limit.`);
        const form = new FormData();
        form.set("projectId", project.id);
        form.set("kind", "document");
        form.set("file", file);
        const response = await fetch("/api/team/assets", {
          method: "POST",
          body: form,
        });
        const result = (await response.json().catch(() => ({}))) as Asset & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(
            result.error || `${file.name} could not be uploaded.`,
          );
        setPendingAssets((old) => [...old, result]);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Attachment upload failed.",
      );
    } finally {
      setUploadingAsset(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };
  const stopVoiceTimer = () => {
    if (voiceTimer.current) clearInterval(voiceTimer.current);
    voiceTimer.current = null;
  };
  const beginVoice = async () => {
    if (!capabilities.voice.available || voiceState !== "idle") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const advertised = new Set(capabilities.voice.acceptedMimeTypes || []);
      const preferred = [
        ["audio/webm", "audio/webm;codecs=opus"],
        ["audio/ogg", "audio/ogg;codecs=opus"],
        ["audio/mp4", "audio/mp4"],
      ].find(
        ([mime, recorderMime]) =>
          advertised.has(mime) && MediaRecorder.isTypeSupported(recorderMime),
      )?.[1];
      if (!preferred) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("No supported voice-note format is available.");
      }
      const next = new MediaRecorder(stream, { mimeType: preferred });
      voiceChunks.current = [];
      voiceBlob.current = null;
      setVoiceSeconds(0);
      next.ondataavailable = (event) => {
        if (event.data.size) voiceChunks.current.push(event.data);
      };
      next.onstop = () => {
        voiceBlob.current = new Blob(voiceChunks.current, {
          type: next.mimeType.split(";")[0],
        });
        stream.getTracks().forEach((track) => track.stop());
        stopVoiceTimer();
        setVoiceState("review");
      };
      next.start(500);
      recorder.current = next;
      setVoiceState("recording");
      voiceTimer.current = setInterval(
        () =>
          setVoiceSeconds((value) => {
            const maxSeconds = Math.min(
              120,
              Math.max(
                1,
                Math.floor(
                  (capabilities.voice.maxDurationMs || 120_000) / 1000,
                ),
              ),
            );
            if (value >= maxSeconds - 1) {
              recorder.current?.stop();
              return maxSeconds;
            }
            return value + 1;
          }),
        1000,
      );
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message.startsWith("No supported")
          ? cause.message
          : "Microphone access was not granted.",
      );
    }
  };
  const toggleVoicePause = () => {
    const active = recorder.current;
    if (!active) return;
    if (active.state === "recording") {
      active.pause();
      setVoiceState("paused");
    } else if (active.state === "paused") {
      active.resume();
      setVoiceState("recording");
    }
  };
  const stopVoice = () => {
    if (recorder.current && recorder.current.state !== "inactive")
      recorder.current.stop();
  };
  const discardVoice = () => {
    stopVoiceTimer();
    const active = recorder.current;
    if (active && active.state !== "inactive") {
      active.onstop = null;
      active.stop();
    }
    active?.stream.getTracks().forEach((track) => track.stop());
    recorder.current = null;
    voiceBlob.current = null;
    voiceChunks.current = [];
    setVoiceSeconds(0);
    setVoiceState("idle");
  };
  const sendVoice = async () => {
    if (!voiceBlob.current || !selected?.employee || voiceState !== "review")
      return;
    setVoiceState("uploading");
    setWorking(true);
    setError("");
    try {
      const maxVoiceBytes = Math.min(
        BROWSER_UPLOAD_FILE_BYTES,
        capabilities.voice.maxBytes || BROWSER_UPLOAD_FILE_BYTES,
      );
      if (voiceBlob.current.size > maxVoiceBytes)
        throw new Error("This voice note exceeds the 3.9 MB upload limit.");
      const extension =
        voiceBlob.current.type === "audio/ogg"
          ? "ogg"
          : voiceBlob.current.type === "audio/mp4"
            ? "m4a"
            : "webm";
      const form = new FormData();
      form.set("projectId", project.id);
      form.set("employeeProjectAssignmentId", selected.employee.id);
      form.set(
        "file",
        new File([voiceBlob.current], `voice-note.${extension}`, {
          type: voiceBlob.current.type,
        }),
      );
      const response = await fetch("/api/runtime/bots/voice", {
        method: "POST",
        body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error || "Voice note could not be sent.");
      discardVoice();
      await loadChat(selected.employee.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Voice note failed.");
      setVoiceState("review");
    } finally {
      setWorking(false);
    }
  };
  const retryVoice = async (messageId: string) => {
    if (!selected?.employee || working) return;
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/runtime/bots/voice/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          employeeProjectAssignmentId: selected.employee.id,
          messageId,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error || "Voice note retry failed.");
      await loadChat(selected.employee.id);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Voice note retry failed.",
      );
    } finally {
      setWorking(false);
    }
  };
  const send = async () => {
    if (
      submitLock.current ||
      sending ||
      !selected?.employee ||
      !selected.runtime?.active ||
      (!message.trim() && !pendingAssets.length)
    )
      return;
    if (message.trim().toLocaleLowerCase() === "/model")
      return openModelShell();
    submitLock.current = true;
    setSending(true);
    setWorking(true);
    setError("");
    const sentMessage = message.trim() || "Shared attachments";
    const sentMentions = mentionedIds;
    const sentAssets = pendingAssets;
    try {
      const response = await fetch("/api/runtime/bots/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          employeeProjectAssignmentId: selected.employee.id,
          message: sentMessage,
          mentionedEmployeeProjectAssignmentIds: sentMentions,
          attachmentAssetIds: sentAssets.map((asset) => asset.id),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          data.error || "Hermes could not complete this message.",
        );
      setMessage("");
      setMentionedIds([]);
      setPendingAssets([]);
      await Promise.all([loadChat(selected.employee.id), load()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Message failed.");
    } finally {
      submitLock.current = false;
      setSending(false);
      setWorking(false);
    }
  };
  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const action = composerAction({
      key: event.key,
      shiftKey: event.shiftKey,
      isComposing: composing.current || event.nativeEvent.isComposing,
      sending: submitLock.current || sending,
      value: message,
    });
    if (action === "newline") return;
    event.preventDefault();
    if (action === "model") openModelShell();
    else void send();
  };
  const lifecycle = async (
    action: "suspend" | "resume" | "reconcile" | "retire",
  ) => {
    if (!selected?.employee) return;
    if (
      action === "retire" &&
      !window.confirm(
        `Remove ${selected.profile.displayName}? Existing work and audit history will remain.`,
      )
    )
      return;
    const endpoint =
      action === "retire"
        ? "/api/runtime/bots/retire"
        : action === "reconcile"
          ? "/api/runtime/bots/reconcile"
          : "/api/runtime/bots/state";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: project.id,
        employeeProjectAssignmentId: selected.employee.id,
        ...(action === "suspend" || action === "resume" ? { action } : {}),
      }),
    });
    if (!response.ok)
      setError(
        (await response.json().catch(() => ({}))).error || "Action failed.",
      );
    else {
      setSettingsOpen(false);
      await load();
    }
  };
  const saveAvatar = async (key: TeamAvatarPresetKey) => {
    if (!selected?.employee) return;
    const response = await fetch("/api/team/avatar", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: project.id,
        employeeProjectAssignmentId: selected.employee.id,
        avatarPresetKey: key,
      }),
    });
    if (!response.ok)
      setError(
        (await response.json().catch(() => ({}))).error ||
          "Avatar could not be saved.",
      );
    else await load();
  };
  const uploadAvatar = async (file: File) => {
    if (!selected?.employee) return;
    const form = new FormData();
    form.set("projectId", project.id);
    form.set("kind", "avatar");
    form.set("employeeProjectAssignmentId", selected.employee.id);
    form.set("file", file);
    const response = await fetch("/api/team/assets", {
      method: "POST",
      body: form,
    });
    if (!response.ok)
      setError(
        (await response.json().catch(() => ({}))).error ||
          "Avatar could not be uploaded.",
      );
    else await load();
  };
  const removeUploadedAvatar = async () => {
    if (!selected?.employee) return;
    const response = await fetch("/api/team/avatar", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: project.id,
        employeeProjectAssignmentId: selected.employee.id,
      }),
    });
    if (!response.ok)
      setError(
        (await response.json().catch(() => ({}))).error ||
          "Avatar could not be removed.",
      );
    else await load();
  };

  return (
    <div className="hq-rise -mx-3 sm:mx-0">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3 px-3 sm:px-0">
        <div>
          <p className="eyebrow">{project.name} · Team</p>
          <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            Your AI workplace
          </h1>
          <p className="mt-1 text-xs text-[var(--gp-muted)]">
            Distinct employees, one project-bound conversation space.
          </p>
        </div>
        <div className="flex gap-2">
          <TactileButton
            variant="secondary"
            onClick={() => void load()}
            className="px-3 text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </TactileButton>
          {canManage && (
            <TactileButton
              onClick={() => setAddBot(true)}
              disabled={!desk?.allowedActions.add}
              className="px-3 text-xs"
            >
              <Plus className="h-3.5 w-3.5" /> Add bot
            </TactileButton>
          )}
        </div>
      </header>
      {(desk || error) && (
        <div
          className={`mx-3 mb-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] sm:mx-0 ${error ? "border-red-500/30 bg-red-500/10 text-[var(--gp-danger)]" : "border-[var(--gp-line)] bg-[var(--gp-surface)] text-[var(--gp-muted)]"}`}
          role={error ? "alert" : "status"}
        >
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          <span>{error || (desk && deskCopy[desk.state])}</span>
        </div>
      )}
      <main
        className={`grid h-[calc(100dvh-220px)] min-h-[560px] overflow-hidden border-y border-[var(--gp-line)] bg-[var(--gp-surface)] sm:rounded-[22px] sm:border ${contextOpen ? "lg:grid-cols-[280px_minmax(0,1fr)_360px]" : "lg:grid-cols-[280px_minmax(0,1fr)]"}`}
      >
        <aside
          className={`${mobileView === "roster" ? "flex" : "hidden"} min-h-0 flex-col border-[var(--gp-line)] lg:flex lg:border-r`}
        >
          <div className="border-b border-[var(--gp-line)] p-3">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold">Team</p>
                <p className="mt-0.5 text-[10px] text-[var(--gp-faint)]">
                  {
                    roster.filter(
                      (bot) => runtimeStatus(bot.runtime) === "Online",
                    ).length
                  }
                  /{roster.length} online
                </p>
              </div>
              <Users className="h-4 w-4 text-[var(--gp-faint)]" />
            </div>
            <label className="relative block">
              <Search className="absolute left-3 top-3.5 h-3.5 w-3.5 text-[var(--gp-faint)]" />
              <span className="sr-only">Search employees</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search employees"
                className="min-h-11 w-full rounded-xl border border-[var(--gp-line)] bg-[var(--gp-canvas)] pl-9 pr-3 text-xs outline-none focus:border-[var(--gp-accent)]"
              />
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="space-y-2">
                <div className="sk h-16" />
                <div className="sk h-16" />
                <div className="sk h-16" />
              </div>
            ) : filteredRoster.length ? (
              filteredRoster.map((bot) => (
                <button
                  key={bot.profile.profileId}
                  onClick={() => selectBot(bot)}
                  className={`mb-1 flex min-h-[64px] w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-[transform,background-color,border-color] duration-200 ease-[cubic-bezier(.16,1,.3,1)] active:scale-[.975] ${selected?.profile.profileId === bot.profile.profileId ? "border-[var(--gp-accent)] bg-[var(--gp-accent-soft)]" : "border-transparent hover:bg-[var(--gp-accent-soft)]"}`}
                >
                  <AnimalAvatar
                    presetKey={avatarKey(bot)}
                    name={bot.profile.displayName}
                    assetId={bot.employee?.avatarAssetId}
                    projectId={project.id}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <strong className="text-xs">
                        {bot.profile.displayName}
                      </strong>
                      <span
                        className={`h-2 w-2 rounded-full ${runtimeStatus(bot.runtime) === "Online" ? "bg-emerald-500" : "bg-amber-500"}`}
                        aria-label={runtimeStatus(bot.runtime)}
                      />
                    </span>
                    <span className="mt-1 block text-[10px] text-[var(--gp-muted)]">
                      {roleFor(bot)}
                    </span>
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-[var(--gp-faint)] lg:hidden" />
                </button>
              ))
            ) : (
              <EmptyState
                icon={<Bot />}
                title="No employees found"
                description="Try another name or role."
              />
            )}
          </div>
          {canManage && (
            <div className="border-t border-[var(--gp-line)] p-3">
              <button
                onClick={() => setAdoptProfile(true)}
                disabled={!desk?.allowedActions.adopt}
                className="min-h-11 w-full rounded-xl border border-[var(--gp-line)] text-xs font-medium transition active:scale-[.975] disabled:opacity-40"
              >
                <Plus className="mr-2 inline h-3.5 w-3.5" />
                Claim existing profile
              </button>
            </div>
          )}
        </aside>
        <section
          className={`${mobileView === "chat" ? "flex" : "hidden"} min-h-0 min-w-0 flex-col lg:flex`}
        >
          {selected ? (
            <>
              <header className="flex min-h-[72px] items-center gap-3 border-b border-[var(--gp-line)] px-3 sm:px-5">
                <button
                  onClick={() => setMobileView("roster")}
                  className="grid min-h-11 min-w-11 place-items-center rounded-xl lg:hidden"
                  aria-label="Back to Team"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <AnimalAvatar
                  presetKey={avatarKey(selected)}
                  name={selected.profile.displayName}
                  size="lg"
                  assetId={selected.employee?.avatarAssetId}
                  projectId={project.id}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-sm font-bold sm:text-base">
                      {selected.profile.displayName}
                    </h2>
                    <StatusPill tone={statusTone(selected.runtime)}>
                      {runtimeStatus(selected.runtime)}
                    </StatusPill>
                  </div>
                  <p className="mt-1 text-[10px] text-[var(--gp-muted)]">
                    {roleFor(selected)} · Project-bound
                  </p>
                </div>
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-[var(--gp-line)] transition active:scale-[.975]"
                  aria-label="Employee settings"
                >
                  <Settings2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    setContextOpen(true);
                    setMobileView("context");
                  }}
                  className={`grid min-h-11 min-w-11 place-items-center rounded-xl border transition active:scale-[.975] ${contextOpen ? "border-[var(--gp-accent)] bg-[var(--gp-accent-soft)]" : "border-[var(--gp-line)]"}`}
                  aria-label="Open context panel"
                >
                  <PanelRight className="h-4 w-4" />
                </button>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto bg-[color-mix(in_srgb,var(--gp-canvas)_72%,var(--gp-surface))] px-3 py-5 sm:px-6">
                {chatLoading ? (
                  <div className="space-y-4">
                    <div className="sk h-16 w-2/3" />
                    <div className="sk ml-auto h-14 w-1/2" />
                  </div>
                ) : messages.length ? (
                  messages.map((item, index) => {
                    const employeeMessage = Boolean(item.authorSystemIdentity);
                    const previous = messages[index - 1];
                    const showDay =
                      !previous ||
                      dayLabel(previous.createdAt) !== dayLabel(item.createdAt);
                    return (
                      <div key={item.id}>
                        {showDay && (
                          <div className="my-5 flex items-center gap-3">
                            <span className="h-px flex-1 bg-[var(--gp-line)]" />
                            <span className="text-[10px] font-medium text-[var(--gp-faint)]">
                              {dayLabel(item.createdAt)}
                            </span>
                            <span className="h-px flex-1 bg-[var(--gp-line)]" />
                          </div>
                        )}
                        <article
                          className={`mb-4 flex items-end gap-2.5 ${employeeMessage ? "" : "flex-row-reverse"}`}
                        >
                          <AnimalAvatar
                            presetKey={
                              employeeMessage
                                ? avatarKey(selected)
                                : fallbackAvatarPresetKey("human")
                            }
                            name={
                              employeeMessage
                                ? selected.profile.displayName
                                : item.author?.name || "You"
                            }
                            size="sm"
                            assetId={
                              employeeMessage
                                ? selected.employee?.avatarAssetId
                                : null
                            }
                            projectId={project.id}
                          />
                          <div
                            className={`max-w-[82%] sm:max-w-[72%] ${employeeMessage ? "" : "text-right"}`}
                          >
                            <div
                              className={`rounded-2xl px-3.5 py-2.5 text-left text-[13px] leading-5 shadow-sm ${employeeMessage ? "rounded-bl-md border border-[var(--gp-line)] bg-[var(--gp-surface)]" : "rounded-br-md bg-[var(--gp-accent)] text-white"}`}
                            >
                              <p className="whitespace-pre-wrap break-words">
                                {item.body}
                              </p>
                              {item.attachments?.map(
                                ({ asset, state, errorCode }) => {
                                  const assetUrl = `/api/team/assets/${encodeURIComponent(asset.id)}?projectId=${encodeURIComponent(project.id)}`;
                                  if (asset.kind === "VOICE_NOTE")
                                    return (
                                      <div
                                        key={asset.id}
                                        className="mt-2 rounded-xl border border-current/15 bg-black/5 p-2.5"
                                      >
                                        <div className="flex items-center gap-2">
                                          <Mic className="h-4 w-4 shrink-0" />
                                          <span className="text-[10px] font-semibold">
                                            Voice note ·{" "}
                                            {asset.durationMs
                                              ? `${Math.ceil(asset.durationMs / 1000)}s`
                                              : "audio"}
                                          </span>
                                        </div>
                                        {state === "READY" ? (
                                          <audio
                                            className="mt-2 h-9 w-full max-w-xs"
                                            controls
                                            preload="metadata"
                                            src={assetUrl}
                                          />
                                        ) : (
                                          <div className="mt-2 flex items-center justify-between gap-2 text-[9px] opacity-80">
                                            <span>
                                              {state === "PROCESSING"
                                                ? "Transcribing…"
                                                : `Failed · ${errorCode || "try again"}`}
                                            </span>
                                            {state === "FAILED" && (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  void retryVoice(item.id)
                                                }
                                                className="min-h-9 rounded-lg border border-current/20 px-2 font-semibold"
                                              >
                                                Retry
                                              </button>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  return (
                                    <a
                                      key={asset.id}
                                      href={assetUrl}
                                      className="mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-current/15 bg-black/5 px-3 py-2 text-left no-underline"
                                    >
                                      <FileText className="h-4 w-4 shrink-0" />
                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[11px] font-semibold">
                                          {asset.safeName}
                                        </span>
                                        <span className="block text-[9px] opacity-70">
                                          {Math.ceil(asset.byteLength / 1024)}{" "}
                                          KB · Download
                                        </span>
                                      </span>
                                    </a>
                                  );
                                },
                              )}
                            </div>
                            <p className="mt-1 px-1 text-[9px] text-[var(--gp-faint)]">
                              {employeeMessage
                                ? selected.profile.displayName
                                : "You"}{" "}
                              · {timeLabel(item.createdAt)}{" "}
                              {employeeMessage ? "" : "· Delivered"}
                            </p>
                          </div>
                        </article>
                      </div>
                    );
                  })
                ) : (
                  <div className="grid h-full place-items-center">
                    <EmptyState
                      icon={<Bot />}
                      title={`Start with ${selected.profile.displayName}`}
                      description="Ask a question, assign work, or use @ to invite another employee."
                    />
                  </div>
                )}
                {working && (
                  <div className="flex items-center gap-2 text-[11px] text-[var(--gp-muted)]">
                    <AnimalAvatar
                      presetKey={avatarKey(selected)}
                      name={selected.profile.displayName}
                      size="sm"
                      assetId={selected.employee?.avatarAssetId}
                      projectId={project.id}
                    />
                    <span className="rounded-2xl rounded-bl-md border border-[var(--gp-line)] bg-[var(--gp-surface)] px-3 py-2">
                      <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--gp-accent)]" />{" "}
                      {selected.profile.displayName} is working…
                    </span>
                  </div>
                )}
                <div ref={bottom} />
              </div>
              {selected.employee && (
                <form
                  onSubmit={(event: FormEvent) => {
                    event.preventDefault();
                    void send();
                  }}
                  className="border-t border-[var(--gp-line)] bg-[var(--gp-surface)] p-3 sm:p-4"
                >
                  <div className="relative rounded-2xl border border-[var(--gp-line)] bg-[var(--gp-canvas)] p-2 focus-within:border-[var(--gp-accent)]">
                    {pendingAssets.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-2 px-1">
                        {pendingAssets.map((asset) => (
                          <span
                            key={asset.id}
                            className="flex max-w-full items-center gap-2 rounded-lg border border-[var(--gp-line)] bg-[var(--gp-surface)] px-2 py-1.5 text-[10px]"
                          >
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                            <span className="max-w-48 truncate">
                              {asset.safeName}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setPendingAssets((old) =>
                                  old.filter((item) => item.id !== asset.id),
                                )
                              }
                              aria-label={`Remove ${asset.safeName}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    {voiceState !== "idle" && (
                      <div className="mb-2 flex min-h-12 items-center gap-2 rounded-xl border border-[var(--gp-line)] bg-[var(--gp-surface)] px-3">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${voiceState === "recording" ? "animate-pulse bg-red-500" : "bg-[var(--gp-accent)]"}`}
                        />
                        <span className="min-w-16 font-mono text-xs">
                          {Math.floor(voiceSeconds / 60)}:
                          {String(voiceSeconds % 60).padStart(2, "0")}
                        </span>
                        {(voiceState === "recording" ||
                          voiceState === "paused") && (
                          <>
                            <button
                              type="button"
                              onClick={toggleVoicePause}
                              className="grid min-h-10 min-w-10 place-items-center rounded-lg"
                              aria-label={
                                voiceState === "paused"
                                  ? "Resume recording"
                                  : "Pause recording"
                              }
                            >
                              {voiceState === "paused" ? (
                                <Play className="h-4 w-4" />
                              ) : (
                                <Pause className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={stopVoice}
                              className="grid min-h-10 min-w-10 place-items-center rounded-lg"
                              aria-label="Stop recording"
                            >
                              <Square className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        {voiceState === "review" && (
                          <button
                            type="button"
                            onClick={() => void sendVoice()}
                            className="ml-auto min-h-10 rounded-lg bg-[var(--gp-accent)] px-3 text-[10px] font-semibold text-white"
                          >
                            Send voice
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={discardVoice}
                          disabled={voiceState === "uploading"}
                          className="grid min-h-10 min-w-10 place-items-center rounded-lg disabled:opacity-40"
                          aria-label="Discard recording"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                    <textarea
                      ref={input}
                      value={message}
                      disabled={!canOperate || !selected.runtime?.active}
                      onChange={(event) => setMessage(event.target.value)}
                      onKeyDown={onComposerKeyDown}
                      onCompositionStart={() => {
                        composing.current = true;
                      }}
                      onCompositionEnd={() => {
                        composing.current = false;
                      }}
                      placeholder={`Message ${selected.profile.displayName}…`}
                      aria-label={`Message ${selected.profile.displayName}`}
                      rows={1}
                      className="max-h-40 min-h-12 w-full resize-none bg-transparent px-2 py-2 text-[13px] outline-none placeholder:text-[var(--gp-faint)]"
                    />
                    {mentionQuery !== null && (
                      <div className="absolute bottom-[70px] left-2 z-10 w-[min(320px,calc(100vw-2rem))] rounded-xl border border-[var(--gp-line)] bg-[var(--gp-raised)] p-1.5 shadow-xl">
                        {matchingMentions.length ? (
                          matchingMentions.map((bot) => (
                            <button
                              type="button"
                              key={bot.profile.profileId}
                              onClick={() => tag(bot)}
                              className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-xs hover:bg-[var(--gp-accent-soft)]"
                            >
                              <AnimalAvatar
                                presetKey={avatarKey(bot)}
                                name={bot.profile.displayName}
                                size="sm"
                              />
                              <span>{mention(bot)}</span>
                            </button>
                          ))
                        ) : (
                          <p className="p-2 text-[10px] text-[var(--gp-muted)]">
                            No matching active employee.
                          </p>
                        )}
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex">
                        <input
                          ref={fileInput}
                          type="file"
                          multiple
                          accept=".pdf,.docx,.txt,.md,image/jpeg,image/png,image/webp"
                          className="sr-only"
                          onChange={(event) =>
                            void uploadDocuments(event.target.files)
                          }
                        />
                        <button
                          type="button"
                          onClick={() => fileInput.current?.click()}
                          disabled={uploadingAsset || pendingAssets.length >= 5}
                          className="grid min-h-11 min-w-11 place-items-center rounded-xl text-[var(--gp-muted)] transition hover:bg-[var(--gp-accent-soft)] active:scale-[.975] disabled:opacity-40"
                          aria-label="Attach files"
                        >
                          <Paperclip className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void beginVoice()}
                          disabled={
                            !capabilities.voice.available ||
                            voiceState !== "idle"
                          }
                          title={
                            capabilities.voice.available
                              ? "Record a voice note"
                              : "Voice notes are unavailable for this employee"
                          }
                          className="grid min-h-11 min-w-11 place-items-center rounded-xl text-[var(--gp-muted)] transition hover:bg-[var(--gp-accent-soft)] active:scale-[.975] disabled:opacity-40"
                          aria-label="Record voice note"
                        >
                          <Mic className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setMessage(
                              (value) =>
                                `${value}${value && !value.endsWith(" ") ? " " : ""}@`,
                            )
                          }
                          className="grid min-h-11 min-w-11 place-items-center rounded-xl text-[var(--gp-muted)] transition hover:bg-[var(--gp-accent-soft)] active:scale-[.975]"
                          aria-label="Mention an employee"
                        >
                          <AtSign className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={openModelShell}
                          className="grid min-h-11 min-w-11 place-items-center rounded-xl text-[var(--gp-muted)] transition hover:bg-[var(--gp-accent-soft)] active:scale-[.975]"
                          aria-label="Open model command"
                        >
                          <Command className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="hidden text-[9px] text-[var(--gp-faint)] sm:inline">
                          Enter to send · Shift+Enter for newline
                        </span>
                        <button
                          type="submit"
                          disabled={
                            !canOperate ||
                            sending ||
                            (!message.trim() && !pendingAssets.length) ||
                            !selected.runtime?.active
                          }
                          className="grid min-h-11 min-w-11 place-items-center rounded-xl bg-[var(--gp-accent)] text-white transition active:scale-[.975] disabled:opacity-40"
                          aria-label={
                            sending ? "Sending message" : "Send message"
                          }
                        >
                          <Send className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              )}
            </>
          ) : (
            <EmptyState
              icon={<Bot />}
              title="Choose an employee"
              description="Select someone from your Team roster."
            />
          )}
        </section>
        {contextOpen && (
          <ContextPanel
            bot={selected}
            capabilities={capabilities}
            mobileView={mobileView}
            close={() => {
              setContextOpen(false);
              setMobileView("chat");
            }}
          />
        )}
      </main>
      {settingsOpen && selected && (
        <EmployeeSettings
          bot={selected}
          projectId={project.id}
          canManage={canManage}
          close={() => setSettingsOpen(false)}
          saveAvatar={saveAvatar}
          uploadAvatar={uploadAvatar}
          removeUploadedAvatar={removeUploadedAvatar}
          lifecycle={lifecycle}
          openModel={() => {
            setSettingsOpen(false);
            setModelShell(true);
          }}
        />
      )}
      {modelShell && (
        <ModelShell
          bot={selected}
          projectId={project.id}
          canManage={canManage}
          close={() => setModelShell(false)}
        />
      )}
      {addBot && (
        <BotForm
          mode="add"
          project={project}
          claims={[]}
          close={() => setAddBot(false)}
          done={async () => {
            setAddBot(false);
            await load();
          }}
        />
      )}
      {adoptProfile && (
        <BotForm
          mode="claim"
          project={project}
          claims={desk?.claimableProfiles || []}
          close={() => setAdoptProfile(false)}
          done={async () => {
            setAdoptProfile(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

function ContextPanel({
  bot,
  capabilities,
  mobileView,
  close,
}: {
  bot?: RosterBot;
  capabilities: Capabilities;
  mobileView: string;
  close: () => void;
}) {
  return (
    <aside
      className={`${mobileView === "context" ? "flex" : "hidden"} min-h-0 flex-col border-l border-[var(--gp-line)] bg-[var(--gp-raised)] lg:flex`}
    >
      <header className="flex min-h-[72px] items-center justify-between border-b border-[var(--gp-line)] px-4">
        <div>
          <p className="text-xs font-semibold">Context</p>
          <p className="mt-1 text-[10px] text-[var(--gp-muted)]">
            Follows {bot?.profile.displayName || "selected employee"}
          </p>
        </div>
        <button
          onClick={close}
          className="grid min-h-11 min-w-11 place-items-center rounded-xl"
          aria-label="Close context panel"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="flex gap-1 border-b border-[var(--gp-line)] p-2">
        <span className="rounded-lg bg-[var(--gp-accent-soft)] px-3 py-2 text-[11px] font-semibold text-[var(--gp-accent)]">
          Browser
        </span>
        <span className="px-3 py-2 text-[11px] text-[var(--gp-faint)]">
          Employee
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex items-center gap-3">
          {bot && (
            <AnimalAvatar
              presetKey={avatarKey(bot)}
              name={bot.profile.displayName}
            />
          )}
          <div>
            <p className="text-xs font-semibold">
              {bot?.profile.displayName}&apos;s browser
            </p>
            <p className="mt-1 text-[10px] text-[var(--gp-muted)]">
              Assignment-scoped workspace
            </p>
          </div>
        </div>
        <div className="mt-5 grid min-h-64 place-items-center rounded-2xl border border-dashed border-[var(--gp-line)] bg-[var(--gp-canvas)] p-6 text-center">
          <div>
            <Monitor className="mx-auto h-7 w-7 text-[var(--gp-faint)]" />
            <h3 className="mt-3 text-sm font-semibold">Browser unavailable</h3>
            <p className="mt-2 text-[11px] leading-5 text-[var(--gp-muted)]">
              {capabilities.browser.viewerLease
                ? "A viewer capability is reported, but T1 does not open a session without the complete assignment-scoped lease flow."
                : "The adapter has not proven an assignment-scoped viewer lease. No browser session or takeover control is exposed."}
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-[var(--gp-line)] p-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold">
            <Info className="h-3.5 w-3.5" /> Capability boundary
          </div>
          <p className="mt-2 text-[10px] leading-4 text-[var(--gp-muted)]">
            Human takeover remains unavailable until exclusive input ownership,
            lease expiry, and revocation are verified.
          </p>
        </div>
      </div>
    </aside>
  );
}

function EmployeeSettings({
  bot,
  projectId,
  canManage,
  close,
  saveAvatar,
  uploadAvatar,
  removeUploadedAvatar,
  lifecycle,
  openModel,
}: {
  bot: RosterBot;
  projectId: string;
  canManage: boolean;
  close: () => void;
  saveAvatar: (key: TeamAvatarPresetKey) => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
  removeUploadedAvatar: () => Promise<void>;
  lifecycle: (
    action: "suspend" | "resume" | "reconcile" | "retire",
  ) => Promise<void>;
  openModel: () => void;
}) {
  const [studio, setStudio] = useState<StudioData | null>(null);
  const [studioError, setStudioError] = useState("");
  const refreshStudio = useCallback(async () => {
    if (!bot.employee?.id) return;
    try {
      const response = await fetch(`/api/runtime/bots/studio?projectId=${encodeURIComponent(projectId)}&employeeProjectAssignmentId=${encodeURIComponent(bot.employee.id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Employee Studio could not be loaded.");
      setStudio(normalizeStudio(await response.json() as RawStudioData)); setStudioError("");
    } catch (cause) { setStudioError(cause instanceof Error ? cause.message : "Employee Studio could not be loaded."); }
  }, [bot.employee?.id, projectId]);
  useEffect(() => { void refreshStudio(); }, [refreshStudio]);
  const studioTone = studio?.state === "READY" ? "good" : studio?.state === "ATTENTION" ? "bad" : studio?.state === "SETUP_REQUIRED" ? "warn" : "neutral";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="employee-settings-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-4"
    >
      <section className="glass-panel max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl p-5 sm:rounded-2xl">
        <header className="flex items-center gap-3">
          <AnimalAvatar
            presetKey={avatarKey(bot)}
            name={bot.profile.displayName}
            size="lg"
            assetId={bot.employee?.avatarAssetId}
            projectId={projectId}
          />
          <div className="flex-1">
            <p className="eyebrow">Employee</p>
            <h2
              id="employee-settings-title"
              className="font-display text-xl font-extrabold"
            >
              {bot.profile.displayName}
            </h2>
            <p className="text-xs text-[var(--gp-muted)]">{roleFor(bot)}</p>
          </div>
          <button
            onClick={close}
            className="grid min-h-11 min-w-11 place-items-center rounded-xl"
            aria-label="Close employee settings"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <nav aria-label="Employee Studio sections" className="mt-5 flex gap-2 overflow-x-auto pb-1">
          {["Overview", "Model", "Profile files", "Skills", "MCP"].map((label) => <a key={label} href={`#studio-${label.toLowerCase().replace(" ", "-")}`} className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-[var(--gp-line)] px-3 text-xs font-semibold transition active:scale-[.975] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gp-accent)]">{label}</a>)}
        </nav>
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--gp-line)] bg-[var(--gp-canvas)] p-3" aria-live="polite">
          <StatusPill tone={studioTone}>{studio?.state || "UNAVAILABLE"}</StatusPill>
          <p className="text-[10px] text-[var(--gp-muted)]">{studioError || (studio?.failureCode ? studio.failureCode.replaceAll("_", " ") : "Signed assignment-scoped observation")}</p>
        </div>
        <div id="studio-overview" className="scroll-mt-4" />
        <div className="mt-5 rounded-xl border border-[var(--gp-line)] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--gp-faint)]">
            Hermes profile
          </p>
          <p className="mt-2 break-all font-mono text-xs">
            {bot.profile.profileId}
          </p>
          {bot.profile.profileId === "default" && (
            <p className="mt-2 text-[10px] text-[var(--gp-muted)]">
              Protected default profile · presented as Chief of Staff
            </p>
          )}
        </div>
        <section className="mt-5">
          <h3 className="text-xs font-semibold">Avatar</h3>
          <p className="mt-1 text-[10px] text-[var(--gp-muted)]">
            Saved only for this project assignment.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <label
              className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[var(--gp-line)] px-3 text-xs font-medium ${canManage ? "" : "pointer-events-none opacity-50"}`}
            >
              <Upload className="h-3.5 w-3.5" /> Upload image
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={!canManage}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadAvatar(file);
                  event.target.value = "";
                }}
              />
            </label>
            {bot.employee?.avatarAssetId && (
              <button
                onClick={() => void removeUploadedAvatar()}
                disabled={!canManage}
                className="min-h-11 rounded-xl border border-[var(--gp-line)] px-3 text-xs disabled:opacity-50"
              >
                Use preset instead
              </button>
            )}
          </div>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-[var(--gp-faint)]">
            Animal presets
          </p>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {teamAvatarPresets.map((preset) => (
              <button
                key={preset.key}
                disabled={!canManage}
                onClick={() => void saveAvatar(preset.key)}
                aria-label={`Use ${preset.name}`}
                aria-pressed={avatarKey(bot) === preset.key}
                className={`grid min-h-16 place-items-center rounded-xl border transition active:scale-[.975] disabled:opacity-50 ${avatarKey(bot) === preset.key ? "border-[var(--gp-accent)] bg-[var(--gp-accent-soft)]" : "border-[var(--gp-line)]"}`}
              >
                <AnimalAvatar
                  presetKey={preset.key}
                  name={preset.name}
                  size="sm"
                />
              </button>
            ))}
          </div>
        </section>
        <button
          id="studio-model"
          onClick={openModel}
          className="mt-5 flex min-h-14 w-full items-center justify-between rounded-xl border border-[var(--gp-line)] px-4 text-left transition active:scale-[.985]"
        >
          <span>
            <span className="block text-xs font-semibold">Model</span>
            <span className="mt-1 block text-[10px] text-[var(--gp-muted)]">
              {studio?.model.capability ? `${studio.model.catalog?.models.length || 0} signed catalog choices` : "Setup required or unavailable"}
            </span>
          </span>
          <ChevronRight className="h-4 w-4" />
        </button>
        <section id="studio-profile-files" className="mt-5 scroll-mt-4 rounded-2xl border border-[var(--gp-line)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-xs font-semibold">Profile files</h3><p className="mt-1 text-[10px] text-[var(--gp-muted)]">Fixed logical keys only. No runtime paths are exposed.</p></div><StatusPill tone={studio?.profileFiles.capability ? "good" : "neutral"}>{studio?.profileFiles.capability ? "READY" : "UNAVAILABLE"}</StatusPill></div>
          {studio?.profileFiles.capability && studio.profileFiles.observed.length ? <div className="mt-3 space-y-2">{studio.profileFiles.observed.map((file) => <ProfileFileControl key={file.logicalKey} file={file} projectId={projectId} employeeProjectAssignmentId={bot.employee!.id} canManage={canManage} />)}</div> : <p className="mt-3 text-[11px] leading-5 text-[var(--gp-muted)]">The adapter has not advertised the signed profile-file capability. Editing and restore remain denied.</p>}
        </section>
        <section id="studio-skills" className="mt-5 scroll-mt-4 rounded-2xl border border-[var(--gp-line)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-xs font-semibold">Skills</h3><p className="mt-1 text-[10px] text-[var(--gp-muted)]">Trusted RogerOS catalog plus signed runtime observation.</p></div><StatusPill tone={studio?.skills.capability ? "good" : "neutral"}>{studio?.skills.capability ? "READY" : "UNAVAILABLE"}</StatusPill></div>
          <div className="mt-3 space-y-2">{studio?.skills.catalog.map((skill) => { const assigned = studio.skills.assignments.some((item) => item.skill.id === skill.id && item.state === "ACTIVE"); const observed = studio.skills.observed.find((item) => item.key === skill.runtimeKey); return <div key={skill.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--gp-line)] p-3"><div className="min-w-0"><p className="text-xs font-semibold">{skill.name}</p><p className="mt-1 text-[10px] text-[var(--gp-muted)]">v{skill.version} · {observed?.installed ? "Observed installed" : "Not observed"}</p></div><button disabled={!canManage || !studio.skills.lifecycle} onClick={() => void mutateStudioSkill(projectId, bot.employee!.id, skill.id, skill.version, assigned ? "DISABLE" : "ENABLE").then(refreshStudio).catch((cause) => setStudioError(cause instanceof Error ? cause.message : "Skill update failed."))} className="min-h-11 rounded-xl border border-[var(--gp-line)] px-3 text-xs font-semibold transition active:scale-[.975] disabled:opacity-45">{assigned ? "Disable" : "Enable"}</button></div>; })}</div>
          {!studio?.skills.catalog.length && <p className="mt-3 text-[11px] text-[var(--gp-muted)]">No trusted enabled Skills are available.</p>}
        </section>
        <section id="studio-mcp" className="mt-5 scroll-mt-4 rounded-2xl border border-[var(--gp-line)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-xs font-semibold">MCP</h3><p className="mt-1 text-[10px] text-[var(--gp-muted)]">Installed healthy project connections only. Every tool starts denied.</p></div><StatusPill tone={studio?.mcp.capability ? "good" : "neutral"}>{studio?.mcp.capability ? "READY" : "UNAVAILABLE"}</StatusPill></div>
          {!studio?.mcp.capability ? <p className="mt-3 text-[11px] leading-5 text-[var(--gp-muted)]">Managed MCP is default-deny because the selected adapter assignment has not advertised this capability.</p> : !studio.mcp.eligibleConnections.length ? <p className="mt-3 text-[11px] leading-5 text-[var(--gp-muted)]">SETUP REQUIRED · Install and connect a healthy project-owned app before enabling a server.</p> : <div className="mt-3 space-y-2">{studio.mcp.observed.map((server) => <McpControl key={server.serverKey} server={server} connections={studio.mcp.eligibleConnections} assignment={studio.mcp.assignments.find((item) => item.serverKey === server.serverKey)} projectId={projectId} employeeProjectAssignmentId={bot.employee!.id} canManage={canManage} onSaved={refreshStudio} />)}</div>}
        </section>
        {canManage && bot.employee && (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--gp-line)] pt-4">
            <TactileButton
              variant="secondary"
              onClick={() => void lifecycle("reconcile")}
              className="px-3 text-xs"
            >
              Reconcile
            </TactileButton>
            <TactileButton
              variant="secondary"
              onClick={() =>
                void lifecycle(
                  bot.runtime?.assignmentState === "SUSPENDED"
                    ? "resume"
                    : "suspend",
                )
              }
              className="px-3 text-xs"
            >
              {bot.runtime?.assignmentState === "SUSPENDED"
                ? "Resume"
                : "Pause"}
            </TactileButton>
            <TactileButton
              variant="secondary"
              disabled={bot.profile.profileId === "default"}
              title={
                bot.profile.profileId === "default"
                  ? "The default Hermes profile is protected."
                  : undefined
              }
              onClick={() => void lifecycle("retire")}
              className="px-3 text-xs text-[var(--gp-danger)]"
            >
              Remove bot
            </TactileButton>
          </div>
        )}
      </section>
    </div>
  );
}

async function mutateStudioSkill(projectId: string, employeeProjectAssignmentId: string, skillId: string, expectedVersion: string, action: "ENABLE" | "DISABLE") {
  const response = await fetch("/api/runtime/bots/skills", { method: "PUT", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ projectId, employeeProjectAssignmentId, skillId, expectedVersion, enabled: action === "ENABLE" }) });
  if (!response.ok) { const value = await response.json().catch(() => ({})) as { error?: string }; throw new Error(value.error || "Skill update failed."); }
}

function McpControl({ server, connections, assignment, projectId, employeeProjectAssignmentId, canManage, onSaved }: { server: { serverKey: string; name: string; healthy: boolean; tools: Array<{ key: string; name: string }> }; connections: Array<{ id: string; name: string }>; assignment?: { state: string; revision: number; tools: Array<{ toolKey: string; enabled: boolean }> }; projectId: string; employeeProjectAssignmentId: string; canManage: boolean; onSaved: () => Promise<void> }) {
  const [connectionId, setConnectionId] = useState(connections[0]?.id || "");
  const [selected, setSelected] = useState(() => new Set(assignment?.tools.filter((tool) => tool.enabled).map((tool) => tool.toolKey) || []));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const enabled = assignment?.state === "ENABLED";
  const save = async (nextEnabled: boolean) => { setBusy(true); setError(""); try { const response = await fetch("/api/runtime/bots/mcp", { method: "PUT", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ projectId, employeeProjectAssignmentId, serverKey: server.serverKey, projectConnectionId: connectionId, enabled: nextEnabled, toolKeys: nextEnabled ? [...selected] : [], expectedRevision: assignment?.revision || 0 }) }); const value = await response.json() as { error?: string }; if (!response.ok) throw new Error(value.error || "MCP update failed."); await onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "MCP update failed."); } finally { setBusy(false); } };
  return <div className="rounded-xl border border-[var(--gp-line)] p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">{server.name}</p><StatusPill tone={enabled ? "good" : server.healthy ? "neutral" : "warn"}>{enabled ? "ENABLED" : server.healthy ? "DEFAULT DENY" : "ATTENTION"}</StatusPill></div><label className="mt-3 block text-[10px] font-semibold text-[var(--gp-muted)]">Project connection<select value={connectionId} onChange={(event) => setConnectionId(event.target.value)} disabled={!canManage || busy} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--gp-line)] bg-[var(--gp-canvas)] px-3 text-xs"><option value="">Select a connection</option>{connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.name}</option>)}</select></label><div className="mt-3 grid gap-2 sm:grid-cols-2">{server.tools.map((tool) => <label key={tool.key} className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--gp-line)] px-3 text-xs"><input type="checkbox" checked={selected.has(tool.key)} disabled={!canManage || busy} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(tool.key); else next.delete(tool.key); return next; })} />{tool.name}</label>)}</div><div className="mt-3 flex gap-2"><button onClick={() => void save(!enabled)} disabled={!canManage || busy || !connectionId || (!enabled && selected.size === 0)} className="min-h-11 rounded-xl bg-[var(--gp-accent)] px-4 text-xs font-semibold text-white disabled:opacity-45">{busy ? "Saving" : enabled ? "Disable server" : "Enable selected tools"}</button></div>{error && <p className="mt-2 text-[10px] text-[var(--gp-danger)]" role="alert">{error}</p>}</div>;
}

function lineDiff(before: string, after: string) {
  const left = before.split("\n"), right = after.split("\n"), rows: string[] = [];
  for (let index = 0; index < Math.max(left.length, right.length) && rows.length < 80; index += 1) {
    if (left[index] === right[index]) continue;
    if (left[index] !== undefined) rows.push(`- ${left[index]}`);
    if (right[index] !== undefined) rows.push(`+ ${right[index]}`);
  }
  return rows;
}

function ProfileFileControl({ file, projectId, employeeProjectAssignmentId, canManage }: { file: { logicalKey: string; version: number; digest: string; state: string }; projectId: string; employeeProjectAssignmentId: string; canManage: boolean }) {
  const [open, setOpen] = useState(false), [content, setContent] = useState(""), [baseline, setBaseline] = useState(""), [version, setVersion] = useState(file.version), [digest, setDigest] = useState(file.digest), [versions, setVersions] = useState<number[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const diff = useMemo(() => lineDiff(baseline, content), [baseline, content]);
  const loadFile = async () => { setBusy(true); setError(""); try { const response = await fetch(`/api/runtime/bots/profile-files?projectId=${encodeURIComponent(projectId)}&employeeProjectAssignmentId=${encodeURIComponent(employeeProjectAssignmentId)}&logicalKey=${encodeURIComponent(file.logicalKey)}`, { cache: "no-store" }); const value = await response.json() as { file?: { content: string; version: number; digest: string }; versions?: Array<{ version: number }>; error?: string }; if (!response.ok || !value.file) throw new Error(value.error || "File unavailable."); setContent(value.file.content); setBaseline(value.file.content); setVersion(value.file.version); setDigest(value.file.digest); setVersions(value.versions?.map((item) => item.version) || []); setOpen(true); } catch (cause) { setError(cause instanceof Error ? cause.message : "File unavailable."); } finally { setBusy(false); } };
  const save = async (restoreVersion?: number) => { setBusy(true); setError(""); try { const response = await fetch("/api/runtime/bots/profile-files", { method: "PUT", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ projectId, employeeProjectAssignmentId, logicalKey: file.logicalKey, expectedDigest: digest, ...(restoreVersion === undefined ? { content } : { restoreVersion }) }) }); const value = await response.json() as { error?: string }; if (!response.ok) throw new Error(value.error || "File update failed."); await loadFile(); } catch (cause) { setError(cause instanceof Error ? cause.message : "File update failed."); } finally { setBusy(false); } };
  return <div className="rounded-xl border border-[var(--gp-line)] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-mono text-xs font-bold">{file.logicalKey}</p><p className="mt-1 text-[10px] text-[var(--gp-muted)]">Version {version} · digest {digest.slice(0, 12)}</p></div><button onClick={() => void (open ? Promise.resolve(setOpen(false)) : loadFile())} disabled={busy} className="min-h-11 rounded-xl border border-[var(--gp-line)] px-3 text-xs font-semibold transition active:scale-[.975] disabled:opacity-45">{open ? "Close" : busy ? "Loading" : "Open"}</button></div>{open && <div className="mt-3"><textarea value={content} onChange={(event) => setContent(event.target.value)} readOnly={!canManage} rows={10} spellCheck={false} className="w-full resize-y rounded-xl border border-[var(--gp-line)] bg-[var(--gp-canvas)] p-3 font-mono text-xs leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gp-accent)]" aria-label={`${file.logicalKey} contents`} />{diff.length > 0 && <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-[var(--gp-panel)] p-3 text-[10px] leading-4 text-[var(--gp-muted)]" aria-label="Unsaved line diff">{diff.join("\n")}</pre>}<div className="mt-2 flex flex-wrap items-center gap-2"><button onClick={() => void save()} disabled={!canManage || busy || content === baseline} className="min-h-11 rounded-xl bg-[var(--gp-accent)] px-4 text-xs font-semibold text-white transition active:scale-[.975] disabled:opacity-45">Save with CAS</button><button onClick={() => setContent(baseline)} disabled={content === baseline} className="min-h-11 rounded-xl border border-[var(--gp-line)] px-3 text-xs disabled:opacity-45">Discard diff</button><select aria-label="Restore file version" defaultValue="" disabled={!canManage || busy || versions.length < 2} onChange={(event) => { if (event.target.value) void save(Number(event.target.value)); }} className="min-h-11 rounded-xl border border-[var(--gp-line)] bg-[var(--gp-canvas)] px-3 text-xs disabled:opacity-45"><option value="">Restore version…</option>{versions.filter((item) => item !== version).map((item) => <option key={item} value={item}>Version {item}</option>)}</select><span className="text-[10px] text-[var(--gp-muted)]">{diff.length ? `${diff.length} changed lines shown` : "No local changes"}</span></div></div>}{error && <p className="mt-2 text-[10px] text-[var(--gp-danger)]" role="alert">{error}</p>}</div>;
}

function ModelShell({ bot, projectId, canManage, close }: { bot?: RosterBot; projectId: string; canManage: boolean; close: () => void }) {
  const [studio, setStudio] = useState<StudioData | null>(null), [query, setQuery] = useState(""), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const employeeId = bot?.employee?.id;
  const loadStudio = useCallback(async () => { if (!employeeId) return; try { const response = await fetch(`/api/runtime/bots/studio?projectId=${encodeURIComponent(projectId)}&employeeProjectAssignmentId=${encodeURIComponent(employeeId)}`, { cache: "no-store" }); if (!response.ok) throw new Error("Model catalog unavailable."); setStudio(normalizeStudio(await response.json() as RawStudioData)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Model catalog unavailable."); } }, [employeeId, projectId]);
  useEffect(() => { void loadStudio(); }, [loadStudio]);
  const models = (studio?.model.catalog?.models || []).filter((model) => `${model.displayName} ${model.provider} ${model.modelId}`.toLowerCase().includes(query.trim().toLowerCase()));
  const choose = async (model: { provider: string; modelId: string }) => { if (!employeeId || !studio?.model.catalog || !studio.model.observed) return; setSaving(true); setError(""); try { const response = await fetch("/api/runtime/bots/model", { method: "PUT", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ projectId, employeeProjectAssignmentId: employeeId, provider: model.provider, modelId: model.modelId, catalogRevision: studio.model.catalog.revision, expectedRevision: studio.expectedRevision }) }); const value = await response.json() as { error?: string }; if (!response.ok) throw new Error(value.error || "Model change failed."); await loadStudio(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Model change failed."); } finally { setSaving(false); } };
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="model-shell-title"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-4 sm:items-center"
    >
      <section className="glass-panel w-full max-w-md rounded-2xl p-5">
        <header className="flex items-start justify-between">
          <div>
            <p className="eyebrow">/model</p>
            <h2
              id="model-shell-title"
              className="mt-1 font-display text-xl font-extrabold"
            >
              Model picker
            </h2>
          </div>
          <button
            onClick={close}
            className="grid min-h-11 min-w-11 place-items-center rounded-xl"
            aria-label="Close model picker"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="mt-4 flex items-center gap-2"><StatusPill tone={studio?.state === "READY" && studio.model.capability ? "good" : studio?.state === "ATTENTION" ? "bad" : "neutral"}>{studio?.state || "UNAVAILABLE"}</StatusPill><p className="text-[10px] text-[var(--gp-muted)]">This command stays in RogerOS and targets only {bot?.profile.displayName || "the selected employee"}.</p></div>
        {studio?.model.capability && studio.model.catalog ? <><label className="mt-4 block text-[10px] font-semibold uppercase tracking-wider text-[var(--gp-faint)]">Search signed catalog<input value={query} onChange={(event) => setQuery(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--gp-line)] bg-[var(--gp-canvas)] px-3 text-xs normal-case tracking-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gp-accent)]" /></label><div className="mt-3 max-h-[48dvh] space-y-2 overflow-y-auto">{models.map((model) => { const active = studio.model.observed?.provider === model.provider && studio.model.observed?.modelId === model.modelId; return <button key={`${model.provider}:${model.modelId}`} disabled={!canManage || saving || active || model.state !== "READY"} onClick={() => void choose(model)} className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-[var(--gp-line)] p-3 text-left transition active:scale-[.985] disabled:opacity-55"><span><span className="block text-xs font-semibold">{model.displayName}</span><span className="mt-1 block font-mono text-[10px] text-[var(--gp-muted)]">{model.provider} · {model.modelId}</span></span><StatusPill tone={active ? "good" : model.state === "READY" ? "neutral" : "warn"}>{active ? "ACTIVE" : model.state}</StatusPill></button>; })}</div></> : <div className="mt-5 rounded-xl border border-[var(--gp-line)] bg-[var(--gp-canvas)] p-4"><p className="text-xs font-semibold">Model configuration unavailable</p><p className="mt-2 text-[11px] leading-5 text-[var(--gp-muted)]">A valid, unexpired, signed assignment catalog is required. No fallback provider or model is assumed.</p></div>}
        {error && <p className="mt-3 text-[11px] text-[var(--gp-danger)]" role="alert">{error}</p>}
        <TactileButton onClick={close} className="mt-5 w-full text-xs">Done</TactileButton>
      </section>
    </div>
  );
}

function BotForm({
  mode,
  project,
  claims,
  close,
  done,
}: {
  mode: "add" | "claim";
  project: Project;
  claims: DeskClaim[];
  close: () => void;
  done: () => Promise<void>;
}) {
  const [name, setName] = useState(""),
    [role, setRole] = useState(""),
    [description, setDescription] = useState(""),
    [claimId, setClaimId] = useState(""),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        mode === "add" ? "/api/runtime/bots" : "/api/runtime/bots/import",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: project.id,
            name,
            role,
            description,
            ...(mode === "claim" ? { claimId } : {}),
          }),
        },
      );
      if (!response.ok)
        throw new Error(
          (await response.json().catch(() => ({}))).error ||
            "Employee could not be added.",
        );
      await done();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Employee could not be added.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center"
    >
      <form
        onSubmit={submit}
        className="glass-panel w-full max-w-lg rounded-2xl p-5"
      >
        <header className="flex justify-between">
          <div>
            <p className="eyebrow">Governed Team identity</p>
            <h2 className="mt-1 font-display text-xl font-extrabold">
              {mode === "add" ? "Add a bot" : "Claim a profile"}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            className="grid min-h-11 min-w-11 place-items-center rounded-xl"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        {error && (
          <p role="alert" className="mt-3 text-xs text-[var(--gp-danger)]">
            {error}
          </p>
        )}
        {mode === "claim" && (
          <label className="mt-4 block text-xs font-semibold">
            Available profile
            <select
              required
              value={claimId}
              onChange={(event) => {
                const claim = claims.find(
                  (item) => item.claimId === event.target.value,
                );
                setClaimId(event.target.value);
                if (claim) {
                  setName(claim.displayName);
                  setRole(claim.role || "");
                  setDescription(claim.description || "");
                }
              }}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-[var(--gp-line)] bg-[var(--gp-surface)] px-3"
            >
              <option value="">Select a protected claim</option>
              {claims.map((claim) => (
                <option key={claim.claimId} value={claim.claimId}>
                  {claim.displayName}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="mt-4 block text-xs font-semibold">
          Name
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-[var(--gp-line)] bg-[var(--gp-surface)] px-3"
          />
        </label>
        <label className="mt-3 block text-xs font-semibold">
          Role
          <input
            required
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-[var(--gp-line)] bg-[var(--gp-surface)] px-3"
          />
        </label>
        <label className="mt-3 block text-xs font-semibold">
          Mission
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="mt-1.5 min-h-20 w-full rounded-xl border border-[var(--gp-line)] bg-[var(--gp-surface)] p-3"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <TactileButton type="button" variant="secondary" onClick={close}>
            Cancel
          </TactileButton>
          <TactileButton
            type="submit"
            disabled={
              saving ||
              !name.trim() ||
              !role.trim() ||
              (mode === "claim" && !claimId)
            }
          >
            {saving
              ? "Saving…"
              : mode === "add"
                ? "Add governed bot"
                : "Claim profile"}
          </TactileButton>
        </div>
      </form>
    </div>
  );
}
