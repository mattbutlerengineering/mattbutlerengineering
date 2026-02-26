import type { LucideIcon } from 'lucide-react';
import {
  // Navigation
  Home,
  ArrowLeft,
  ArrowRight,
  Menu,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  // Actions
  Save,
  Trash2,
  SquarePen,
  Plus,
  Copy,
  Share,
  Download,
  Upload,
  RefreshCw,
  Undo,
  Redo,
  // Communication
  Mail,
  MessageCircle,
  Bell,
  Send,
  Phone,
  // Status
  CircleCheck,
  CircleX,
  AlertTriangle,
  Info,
  Loader,
  // Content
  File,
  FileText,
  Folder,
  FolderOpen,
  Image,
  Link2,
  Clipboard,
  // User
  User,
  Users,
  UserPlus,
  Settings,
  LogOut,
  // Data
  Filter,
  ArrowUpDown,
  BarChart3,
  TrendingUp,
  TrendingDown,
  ListChecks,
  // Media
  Play,
  Pause,
  Camera,
  Video,
  // Commerce
  ShoppingCart,
  CreditCard,
  DollarSign,
  Package,
  Tag,
} from 'lucide-react';

/** Ordered icon category names. */
export const iconCategories = [
  'navigation',
  'actions',
  'communication',
  'status',
  'content',
  'user',
  'data',
  'media',
  'commerce',
] as const;

export type IconCategory = (typeof iconCategories)[number];

export interface IconEntry {
  /** Semantic concept name used for lookups (e.g. "save", "delete"). */
  concept: string;
  /** Human-readable label for display. */
  label: string;
  /** Lucide icon component. */
  icon: LucideIcon;
  /** Category grouping. */
  category: IconCategory;
}

export const iconVocabulary: readonly IconEntry[] = [
  // ── Navigation ──────────────────────────────
  { concept: 'home', label: 'Home', icon: Home, category: 'navigation' },
  { concept: 'back', label: 'Back', icon: ArrowLeft, category: 'navigation' },
  {
    concept: 'forward',
    label: 'Forward',
    icon: ArrowRight,
    category: 'navigation',
  },
  { concept: 'menu', label: 'Menu', icon: Menu, category: 'navigation' },
  { concept: 'search', label: 'Search', icon: Search, category: 'navigation' },
  {
    concept: 'external-link',
    label: 'External Link',
    icon: ExternalLink,
    category: 'navigation',
  },
  {
    concept: 'expand',
    label: 'Expand',
    icon: ChevronDown,
    category: 'navigation',
  },
  {
    concept: 'collapse',
    label: 'Collapse',
    icon: ChevronRight,
    category: 'navigation',
  },
  {
    concept: 'more-actions',
    label: 'More Actions',
    icon: MoreHorizontal,
    category: 'navigation',
  },

  // ── Actions ─────────────────────────────────
  { concept: 'save', label: 'Save', icon: Save, category: 'actions' },
  { concept: 'delete', label: 'Delete', icon: Trash2, category: 'actions' },
  { concept: 'edit', label: 'Edit', icon: SquarePen, category: 'actions' },
  { concept: 'add', label: 'Add', icon: Plus, category: 'actions' },
  { concept: 'copy', label: 'Copy', icon: Copy, category: 'actions' },
  { concept: 'share', label: 'Share', icon: Share, category: 'actions' },
  {
    concept: 'download',
    label: 'Download',
    icon: Download,
    category: 'actions',
  },
  { concept: 'upload', label: 'Upload', icon: Upload, category: 'actions' },
  {
    concept: 'refresh',
    label: 'Refresh',
    icon: RefreshCw,
    category: 'actions',
  },
  { concept: 'undo', label: 'Undo', icon: Undo, category: 'actions' },
  { concept: 'redo', label: 'Redo', icon: Redo, category: 'actions' },

  // ── Communication ───────────────────────────
  { concept: 'email', label: 'Email', icon: Mail, category: 'communication' },
  {
    concept: 'message',
    label: 'Message',
    icon: MessageCircle,
    category: 'communication',
  },
  {
    concept: 'notification',
    label: 'Notification',
    icon: Bell,
    category: 'communication',
  },
  { concept: 'send', label: 'Send', icon: Send, category: 'communication' },
  { concept: 'phone', label: 'Phone', icon: Phone, category: 'communication' },

  // ── Status ──────────────────────────────────
  {
    concept: 'success',
    label: 'Success',
    icon: CircleCheck,
    category: 'status',
  },
  { concept: 'error', label: 'Error', icon: CircleX, category: 'status' },
  {
    concept: 'warning',
    label: 'Warning',
    icon: AlertTriangle,
    category: 'status',
  },
  { concept: 'info', label: 'Info', icon: Info, category: 'status' },
  { concept: 'loading', label: 'Loading', icon: Loader, category: 'status' },

  // ── Content ─────────────────────────────────
  { concept: 'file', label: 'File', icon: File, category: 'content' },
  {
    concept: 'file-text',
    label: 'File Text',
    icon: FileText,
    category: 'content',
  },
  { concept: 'folder', label: 'Folder', icon: Folder, category: 'content' },
  {
    concept: 'folder-open',
    label: 'Folder Open',
    icon: FolderOpen,
    category: 'content',
  },
  { concept: 'image', label: 'Image', icon: Image, category: 'content' },
  { concept: 'link', label: 'Link', icon: Link2, category: 'content' },
  {
    concept: 'clipboard',
    label: 'Clipboard',
    icon: Clipboard,
    category: 'content',
  },

  // ── User ────────────────────────────────────
  { concept: 'user', label: 'User', icon: User, category: 'user' },
  { concept: 'users', label: 'Users', icon: Users, category: 'user' },
  { concept: 'user-add', label: 'Add User', icon: UserPlus, category: 'user' },
  { concept: 'settings', label: 'Settings', icon: Settings, category: 'user' },
  { concept: 'logout', label: 'Log Out', icon: LogOut, category: 'user' },

  // ── Data ────────────────────────────────────
  { concept: 'filter', label: 'Filter', icon: Filter, category: 'data' },
  { concept: 'sort', label: 'Sort', icon: ArrowUpDown, category: 'data' },
  { concept: 'chart', label: 'Chart', icon: BarChart3, category: 'data' },
  {
    concept: 'trending-up',
    label: 'Trending Up',
    icon: TrendingUp,
    category: 'data',
  },
  {
    concept: 'trending-down',
    label: 'Trending Down',
    icon: TrendingDown,
    category: 'data',
  },
  {
    concept: 'checklist',
    label: 'Checklist',
    icon: ListChecks,
    category: 'data',
  },

  // ── Media ───────────────────────────────────
  { concept: 'play', label: 'Play', icon: Play, category: 'media' },
  { concept: 'pause', label: 'Pause', icon: Pause, category: 'media' },
  { concept: 'camera', label: 'Camera', icon: Camera, category: 'media' },
  { concept: 'video', label: 'Video', icon: Video, category: 'media' },

  // ── Commerce ────────────────────────────────
  { concept: 'cart', label: 'Cart', icon: ShoppingCart, category: 'commerce' },
  {
    concept: 'credit-card',
    label: 'Credit Card',
    icon: CreditCard,
    category: 'commerce',
  },
  {
    concept: 'dollar',
    label: 'Dollar',
    icon: DollarSign,
    category: 'commerce',
  },
  { concept: 'package', label: 'Package', icon: Package, category: 'commerce' },
  { concept: 'tag', label: 'Tag', icon: Tag, category: 'commerce' },
];

const conceptMap = new Map<string, LucideIcon>(
  iconVocabulary.map((entry) => [entry.concept, entry.icon])
);

/** Look up a Lucide icon component by semantic concept name. */
export function getIcon(concept: string): LucideIcon | undefined {
  return conceptMap.get(concept);
}

/** Get all icon entries for a given category. */
export function getIconsByCategory(
  category: IconCategory
): readonly IconEntry[] {
  return iconVocabulary.filter((entry) => entry.category === category);
}
