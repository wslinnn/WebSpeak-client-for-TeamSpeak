import {
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  DoorOpen,
  Download,
  Ellipsis,
  Hash,
  Headphones,
  Info,
  Lock,
  Menu,
  MessageSquare,
  Mic,
  MicOff,
  Monitor,
  Paperclip,
  Plus,
  Search,
  Send,
  Server,
  Settings,
  Shield,
  Star,
  Users,
  Volume2,
  VolumeX,
  X,
  type LucideProps,
} from "lucide-react";

import { cn } from "@/lib/utils";

/** 旧 Icon.vue 的平价映射：DOM 钩子保持 `svg.ui-icon`（皮肤与 21-components.css
 *  依赖该类名），字形取 lucide 同风格描边图标。 */
const NAME_MAP = {
  server: Server,
  hash: Hash,
  lock: Lock,
  users: Users,
  mic: Mic,
  "mic-off": MicOff,
  "chevron-right": ChevronRight,
  "chevron-down": ChevronDown,
  plus: Plus,
  download: Download,
  settings: Settings,
  headset: Headphones,
  monitor: Monitor,
  paperclip: Paperclip,
  close: X,
  info: Info,
  check: Check,
  star: Star,
  globe: Globe,
  door: DoorOpen,
  more: Ellipsis,
  volume: Volume2,
  "volume-off": VolumeX,
  menu: Menu,
  search: Search,
  clock: Clock,
  shield: Shield,
  send: Send,
  copy: Copy,
  bell: Bell,
  message: MessageSquare,
} as const;

export type IconName = keyof typeof NAME_MAP;

export function Icon({ name, size = 16, className, ...rest }: { name: IconName; size?: number } & LucideProps) {
  const Glyph = NAME_MAP[name];
  return <Glyph className={cn("ui-icon", className)} width={size} height={size} aria-hidden="true" {...rest} />;
}

function Globe(props: LucideProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
    </svg>
  );
}
