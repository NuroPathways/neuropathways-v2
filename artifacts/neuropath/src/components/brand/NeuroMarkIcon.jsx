import { forwardRef } from "react";

const NeuroMarkIcon = forwardRef(function NeuroMarkIcon(
  { size = 24, className, color, strokeWidth, absoluteStrokeWidth, ...props },
  ref,
) {
  const accessible = Boolean(props["aria-label"] || props.title);
  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      focusable="false"
      aria-hidden={accessible ? undefined : true}
      role={accessible ? "img" : undefined}
      {...props}
    >
      <defs>
        <linearGradient id="neuropathways-mark-gradient" x1="7" y1="8" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#48D187" />
          <stop offset=".48" stopColor="#13B7B3" />
          <stop offset="1" stopColor="#1765C5" />
        </linearGradient>
      </defs>
      <path
        fill="url(#neuropathways-mark-gradient)"
        d="M23.2 3.5c-9.1 0-15.7 6.4-15.7 15.1 0 4.8 2.5 8.1 4.5 11.2 1.3 2 1.7 4.1.8 6.3l-2 5.6h13.6c4.8 0 7.1-2.7 6.2-6.2l-.7-2.7c2.1-2.9 4.7-4.3 8.1-4.7 1.7-.2 2.8-1.4 2.8-2.9 0-1.2-.8-2.1-2-2.5.8-1.5.6-2.7-.4-3.7-1.2-1.1-2.2-2-2.5-3.6C34.7 7.9 30.1 3.5 23.2 3.5Z"
      />
      <path
        d="M30.6 11.8c-.2 4.3-4 6-11.2 8.2-6.2 1.9-6.3 5.3-.4 7.8 5.1 2.1 7 5 3.8 9.2"
        stroke="white"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <path
        d="m29 5.9 1.3 3.3 3.5.3-2.7 2.2.9 3.4-3-1.9-3 1.9.9-3.4-2.7-2.2 3.5-.3L29 5.9Z"
        fill="white"
      />
    </svg>
  );
});

export {
  NeuroMarkIcon as Activity,
  NeuroMarkIcon as AlertCircle,
  NeuroMarkIcon as AlertTriangle,
  NeuroMarkIcon as ArrowDownRight,
  NeuroMarkIcon as ArrowLeft,
  NeuroMarkIcon as ArrowRight,
  NeuroMarkIcon as ArrowUpRight,
  NeuroMarkIcon as Baby,
  NeuroMarkIcon as BarChart2,
  NeuroMarkIcon as Bell,
  NeuroMarkIcon as BookOpen,
  NeuroMarkIcon as Bot,
  NeuroMarkIcon as Brain,
  NeuroMarkIcon as Calendar,
  NeuroMarkIcon as CalendarDays,
  NeuroMarkIcon as Camera,
  NeuroMarkIcon as Check,
  NeuroMarkIcon as CheckCircle,
  NeuroMarkIcon as CheckCircle2,
  NeuroMarkIcon as ChevronDown,
  NeuroMarkIcon as ChevronDownIcon,
  NeuroMarkIcon as ChevronLeft,
  NeuroMarkIcon as ChevronLeftIcon,
  NeuroMarkIcon as ChevronRight,
  NeuroMarkIcon as ChevronRightIcon,
  NeuroMarkIcon as ChevronUp,
  NeuroMarkIcon as Circle,
  NeuroMarkIcon as ClipboardList,
  NeuroMarkIcon as Clock,
  NeuroMarkIcon as Copy,
  NeuroMarkIcon as Download,
  NeuroMarkIcon as Edit2,
  NeuroMarkIcon as ExternalLink,
  NeuroMarkIcon as Eye,
  NeuroMarkIcon as EyeOff,
  NeuroMarkIcon as FileJson,
  NeuroMarkIcon as FileText,
  NeuroMarkIcon as FileUp,
  NeuroMarkIcon as Flame,
  NeuroMarkIcon as FolderOpen,
  NeuroMarkIcon as Frown,
  NeuroMarkIcon as Gift,
  NeuroMarkIcon as GripVertical,
  NeuroMarkIcon as Heart,
  NeuroMarkIcon as Image,
  NeuroMarkIcon as Key,
  NeuroMarkIcon as LayoutGrid,
  NeuroMarkIcon as Lightbulb,
  NeuroMarkIcon as Loader2,
  NeuroMarkIcon as Loader2Icon,
  NeuroMarkIcon as Lock,
  NeuroMarkIcon as LockKeyhole,
  NeuroMarkIcon as LogOut,
  NeuroMarkIcon as Home,
  NeuroMarkIcon as LifeBuoy,
  NeuroMarkIcon as Mail,
  NeuroMarkIcon as Meh,
  NeuroMarkIcon as MessageCircle,
  NeuroMarkIcon as MessageSquare,
  NeuroMarkIcon as Menu,
  NeuroMarkIcon as Minus,
  NeuroMarkIcon as Moon,
  NeuroMarkIcon as MoreHorizontal,
  NeuroMarkIcon as PanelLeft,
  NeuroMarkIcon as PanelLeftIcon,
  NeuroMarkIcon as Pencil,
  NeuroMarkIcon as Phone,
  NeuroMarkIcon as Plus,
  NeuroMarkIcon as Printer,
  NeuroMarkIcon as RefreshCw,
  NeuroMarkIcon as Save,
  NeuroMarkIcon as Search,
  NeuroMarkIcon as Send,
  NeuroMarkIcon as Settings,
  NeuroMarkIcon as Shield,
  NeuroMarkIcon as ShieldAlert,
  NeuroMarkIcon as ShieldCheck,
  NeuroMarkIcon as Smile,
  NeuroMarkIcon as Sparkles,
  NeuroMarkIcon as Star,
  NeuroMarkIcon as Stethoscope,
  NeuroMarkIcon as Sun,
  NeuroMarkIcon as Target,
  NeuroMarkIcon as ThumbsDown,
  NeuroMarkIcon as ThumbsUp,
  NeuroMarkIcon as TimerReset,
  NeuroMarkIcon as Trash2,
  NeuroMarkIcon as TrendingDown,
  NeuroMarkIcon as TrendingUp,
  NeuroMarkIcon as Trophy,
  NeuroMarkIcon as Upload,
  NeuroMarkIcon as User,
  NeuroMarkIcon as UserCheck,
  NeuroMarkIcon as UserPlus,
  NeuroMarkIcon as UserRound,
  NeuroMarkIcon as UserRoundCheck,
  NeuroMarkIcon as Users,
  NeuroMarkIcon as Wind,
  NeuroMarkIcon as X,
  NeuroMarkIcon as XCircle,
  NeuroMarkIcon as Zap,
};

export default NeuroMarkIcon;
