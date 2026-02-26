import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { precision, spring, springGentle } from '@mbe/rialto/motion';
import {
  Accordion,
  Alert,
  AnimatedTag,
  AspectRatio,
  Avatar,
  AvatarGroup,
  Badge,
  Banner,
  Breadcrumb,
  Button,
  Card,
  Checkbox,
  Collapsible,
  CommandPalette,
  ConfirmDialog,
  ContextMenu,
  DataList,
  Dialog,
  Divider,
  Drawer,
  DropdownMenu,
  EmptyState,
  HoverCard,
  Input,
  Kbd,
  Meter,
  Navbar,
  NavigationMenu,
  NumberInput,
  Pagination,
  PinInput,
  Popover,
  Progress,
  Radio,
  RadioGroup,
  RialtoProvider,
  ScrollArea,
  SegmentedControl,
  Select,
  Shortcut,
  Skeleton,
  SkeletonGroup,
  Slider,
  Spinner,
  Stack,
  Stat,
  Steps,
  Table,
  Tabs,
  Tag,
  TagGroup,
  Text,
  TextArea,
  Timeline,
  Toggle,
  Tooltip,
  Tree,
  getIconsByCategory,
  iconCategories,
  type CommandItem,
  type VibeName,
  useToast,
} from '@mbe/rialto';
import { FloatingControls } from '../layouts/DemoLayout';
import styles from './App.module.css';

/* ── Animation helpers ───────────────────────── */
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  visible: {
    transition: { staggerChildren: 0.08 },
  },
};

function Section({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.section
      id={title.toLowerCase().replace(/[\s&/]+/g, '-')}
      className={styles.section}
      initial={shouldReduceMotion ? undefined : 'hidden'}
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
      variants={stagger}
    >
      <div className={styles.sectionInner}>
        <motion.div variants={fadeUp} transition={springGentle}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionNumber}>{number}</span>
            <h2 className={styles.sectionTitle}>{title}</h2>
          </div>
          {description && (
            <p className={styles.sectionDescription}>{description}</p>
          )}
        </motion.div>
        <motion.div variants={fadeUp} transition={springGentle}>
          {children}
        </motion.div>
      </div>
    </motion.section>
  );
}

/* ── Data ────────────────────────────────────── */
const SURFACES = [
  { name: 'surface', color: 'var(--rialto-surface)' },
  { name: 'elevated', color: 'var(--rialto-surface-elevated)' },
  { name: 'recessed', color: 'var(--rialto-surface-recessed)' },
  { name: 'matte', color: 'var(--rialto-surface-matte)' },
  { name: 'deep', color: 'var(--rialto-surface-deep)' },
];

const COLOR_PALETTE = [
  {
    group: 'Text',
    tokens: [
      { name: 'text-primary', value: '#1a1918' },
      { name: 'text-secondary', value: '#6b6660' },
      { name: 'text-tertiary', value: '#9e9890' },
      { name: 'text-on-accent', value: '#fdfcfa' },
    ],
  },
  {
    group: 'Borders',
    tokens: [
      { name: 'border', value: '#d8d4cd' },
      { name: 'border-strong', value: '#b8b4ad' },
    ],
  },
  {
    group: 'Accent',
    tokens: [
      { name: 'accent', value: '#c4922a' },
      { name: 'accent-hover', value: '#d4a23a' },
      { name: 'accent-muted', value: '12% α' },
      { name: 'accent-glow', value: '35% α' },
    ],
  },
  {
    group: 'Semantic',
    tokens: [
      { name: 'error', value: '#b84a3c' },
      { name: 'error-muted', value: '10% α' },
      { name: 'success', value: '#7a8a3c' },
      { name: 'success-muted', value: '10% α' },
    ],
  },
  { group: 'Overlay', tokens: [{ name: 'overlay', value: '40% α' }] },
];

const TYPE_SCALE = [
  {
    token: '--rialto-text-3xl',
    label: '3xl · Display',
    text: 'Precision',
    weight: 300,
    tracking: '-0.04em',
  },
  {
    token: '--rialto-text-2xl',
    label: '2xl · Hero',
    text: 'Material honesty',
    weight: 300,
    tracking: '-0.03em',
  },
  {
    token: '--rialto-text-xl',
    label: 'xl · Title',
    text: 'Restrained luxury',
    weight: 300,
    tracking: '-0.02em',
  },
  {
    token: '--rialto-text-lg',
    label: 'lg · Heading',
    text: 'Tactile contrast',
    weight: 400,
    tracking: '-0.02em',
  },
  {
    token: '--rialto-text-md',
    label: 'md · Subhead',
    text: 'Surfaces that feel machined',
    weight: 400,
    tracking: '0',
  },
  {
    token: '--rialto-text-base',
    label: 'base · Body',
    text: 'The digital translation of anodized aluminum, Gorilla Glass, and precision-milled controls.',
    weight: 400,
    tracking: '0',
  },
  {
    token: '--rialto-text-sm',
    label: 'sm · Caption',
    text: 'Interactions that feel physical, color used surgically, restraint as a feature.',
    weight: 400,
    tracking: '0',
  },
  {
    token: '--rialto-text-xs',
    label: 'xs · Label',
    text: 'ANODIZED ALUMINUM · GORILLA GLASS · PHYSICAL CONTROLS',
    weight: 500,
    tracking: '0.04em',
  },
];

const SPACING_SCALE = [
  { token: '2xs', value: '4px' },
  { token: 'xs', value: '8px' },
  { token: 'sm', value: '12px' },
  { token: 'md', value: '16px' },
  { token: 'lg', value: '24px' },
  { token: 'xl', value: '32px' },
  { token: '2xl', value: '48px' },
  { token: '3xl', value: '64px' },
  { token: '4xl', value: '96px' },
];

const RADIUS_SCALE = [
  { token: 'none', value: '0', usage: 'No rounding' },
  { token: 'sharp', value: '2px', usage: 'Chips, badges' },
  { token: 'default', value: '6px', usage: 'Buttons, inputs' },
  { token: 'soft', value: '10px', usage: 'Cards, containers' },
  { token: 'round', value: '9999px', usage: 'Pills, avatars' },
];

const SHADOW_TOKENS = [
  { token: 'elevated', description: 'Standard elevation for raised elements' },
  { token: 'pressed', description: 'Tactile inset for pressed states' },
  { token: 'focus', description: 'Gold glow ring for focus-visible' },
  { token: 'glass', description: 'Depth layer for glass panels' },
];

const MATERIAL_SWATCHES: {
  name: string;
  label: string;
  description: string;
  style: string;
}[] = [
  {
    name: 'aluminum',
    label: 'Aluminum',
    description: 'Default interactive surface',
    style: 'materialAluminum',
  },
  {
    name: 'polished',
    label: 'Polished',
    description: 'Elevated interactive elements',
    style: 'materialPolished',
  },
  {
    name: 'glass',
    label: 'Glass',
    description: 'Overlays, dialogs, floating panels',
    style: 'materialGlass',
  },
  {
    name: 'recessed',
    label: 'Recessed',
    description: 'Inputs, tracks, channels',
    style: 'materialRecessed',
  },
  {
    name: 'dark',
    label: 'Dark Surface',
    description: 'Full-page backgrounds, headers',
    style: 'materialDark',
  },
];

const LAP_DATA = [
  {
    id: 1,
    driver: 'Charles Leclerc',
    lap: 14,
    sector1: '28.412',
    sector2: '34.891',
    sector3: '22.107',
    total: '1:25.410',
    delta: '-0.342',
  },
  {
    id: 2,
    driver: 'Lewis Hamilton',
    lap: 14,
    sector1: '28.673',
    sector2: '34.752',
    sector3: '22.331',
    total: '1:25.756',
    delta: '+0.004',
  },
  {
    id: 3,
    driver: 'Marc Newson',
    lap: 12,
    sector1: '29.101',
    sector2: '35.244',
    sector3: '22.890',
    total: '1:27.235',
    delta: '+1.483',
  },
  {
    id: 4,
    driver: 'Adrian Newey',
    lap: 11,
    sector1: '29.445',
    sector2: '35.601',
    sector3: '23.112',
    total: '1:28.158',
    delta: '+2.406',
  },
  {
    id: 5,
    driver: 'Adrian Newey',
    lap: 14,
    sector1: '28.890',
    sector2: '35.112',
    sector3: '22.550',
    total: '1:26.552',
    delta: '+0.800',
  },
];

/* ── App ─────────────────────────────────────── */
export function App() {
  const [toggleA, setToggleA] = useState(false);
  const [toggleB, setToggleB] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drivingMode, setDrivingMode] = useState('');
  const [throttle, setThrottle] = useState(72);
  const [downforce, setDownforce] = useState(650);
  const { toast } = useToast();
  const [motionPrecisionActive, setMotionPrecisionActive] = useState(false);
  const [motionSpringActive, setMotionSpringActive] = useState(false);
  const [staggerPhase, setStaggerPhase] = useState(false);
  const [springLoop, setSpringLoop] = useState(false);
  const [checkA, setCheckA] = useState(true);
  const [checkB, setCheckB] = useState(false);
  const [checkC, setCheckC] = useState(false);
  const [radioValue, setRadioValue] = useState('sport');
  const [pageA, setPageA] = useState(1);
  const [pageB, setPageB] = useState(7);
  const [tags, setTags] = useState([
    'Fiorano',
    'Monza',
    'Mugello',
    'Imola',
    'Spa',
  ]);
  const [notes, setNotes] = useState('');
  const [selectedFilters, setSelectedFilters] = useState<Set<string>>(
    new Set(['V6'])
  );
  const [lapCount, setLapCount] = useState(5);
  const [fuelMix, setFuelMix] = useState(3);
  const [brakeBias, setBrakeBias] = useState(56);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [drawerRight, setDrawerRight] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [drawerLeft, setDrawerLeft] = useState(false);
  const [drawerBottom, setDrawerBottom] = useState(false);
  const [wizardStep, setWizardStep] = useState(2);
  const [navOpen, setNavOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [segmentedView, setSegmentedView] = useState('grid');
  const [collapsibleOpen, setCollapsibleOpen] = useState(false);
  const [activeVibe, setActiveVibe] = useState<VibeName>('default');
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem('rialto-theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [rtl, setRtl] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('rialto-dir') === 'rtl';
  });
  const shouldReduceMotion = useReducedMotion();

  /* ── Persist dark mode preference ────────────── */
  useEffect(() => {
    localStorage.setItem('rialto-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  /* ── Persist RTL preference ────────────────── */
  useEffect(() => {
    localStorage.setItem('rialto-dir', rtl ? 'rtl' : 'ltr');
  }, [rtl]);

  /* ── Auto-looping motion demos ────────────── */
  useEffect(() => {
    if (shouldReduceMotion) return;
    const id = setInterval(() => setStaggerPhase((v) => !v), 2000);
    return () => clearInterval(id);
  }, [shouldReduceMotion]);

  useEffect(() => {
    if (shouldReduceMotion) return;
    const id = setTimeout(() => setSpringLoop(true), 800);
    return () => clearTimeout(id);
  }, [shouldReduceMotion]);

  /* ── Command palette items ───────────────── */
  const cmdItems: CommandItem[] = useMemo(
    () => [
      {
        id: 'toggle-mode',
        label: 'Toggle Driving Mode',
        group: 'Actions',
        shortcut: ['⌘', 'D'],
        onSelect: () => toast({ title: 'Driving mode toggled' }),
      },
      {
        id: 'save-config',
        label: 'Save Configuration',
        group: 'Actions',
        shortcut: ['⌘', 'S'],
        onSelect: () =>
          toast({ title: 'Configuration saved', variant: 'success' }),
      },
      {
        id: 'launch-control',
        label: 'Arm Launch Control',
        group: 'Actions',
        onSelect: () =>
          toast({ title: 'Launch control armed', variant: 'accent' }),
      },
      {
        id: 'reset-telemetry',
        label: 'Reset Telemetry',
        group: 'Actions',
        onSelect: () => toast({ title: 'Telemetry reset' }),
      },
      {
        id: 'lap-data',
        label: 'View Lap Data',
        group: 'Navigation',
        shortcut: ['⌘', 'L'],
      },
      {
        id: 'settings',
        label: 'Open Settings',
        group: 'Navigation',
        shortcut: ['⌘', ','],
      },
      { id: 'pit-wall', label: 'Pit Wall Dashboard', group: 'Navigation' },
      { id: 'garage', label: 'Garage View', group: 'Navigation' },
      {
        id: 'theme-light',
        label: 'Switch to Light Theme',
        group: 'Preferences',
      },
      { id: 'theme-dark', label: 'Switch to Dark Theme', group: 'Preferences' },
      {
        id: 'reduce-motion',
        label: 'Toggle Reduced Motion',
        group: 'Preferences',
      },
    ],
    [toast]
  );

  const NAV_CATEGORIES = [
    {
      label: 'Form',
      items: [
        'Button',
        'Input',
        'TextArea',
        'Number Input',
        'Checkbox & Radio',
        'Toggle',
        'Slider',
        'Select',
        'Pin Input',
      ],
    },
    {
      label: 'Data',
      items: [
        'Card',
        'Table',
        'Badge',
        'Tag',
        'Avatar',
        'Stat',
        'Data List',
        'Meter',
        'Kbd',
      ],
    },
    {
      label: 'Navigation',
      items: [
        'Tabs',
        'Breadcrumb',
        'Steps',
        'Pagination',
        'Segmented Control',
        'Navigation Menu',
        'Tree',
        'Navbar',
      ],
    },
    {
      label: 'Feedback',
      items: [
        'Toast',
        'Alert',
        'Banner',
        'Progress',
        'Skeleton',
        'Empty State',
      ],
    },
    {
      label: 'Overlays',
      items: [
        'Dialog',
        'Confirm Dialog',
        'Drawer',
        'Command Palette',
        'Tooltip',
        'Popover',
        'Hover Card',
        'Dropdown Menu',
        'Context Menu',
      ],
    },
    {
      label: 'Layout',
      items: [
        'Divider',
        'Text',
        'Stack',
        'Collapsible',
        'Accordion',
        'Aspect Ratio',
        'Scroll Area',
        'Timeline',
      ],
    },
    {
      label: 'Tokens',
      items: [
        'Motion',
        'Typography',
        'Color',
        'Spacing',
        'Radius',
        'Shadows',
        'Surfaces',
        'Icon Vocabulary',
      ],
    },
    {
      label: 'Demo Pages',
      items: ['Full-Page Demos'],
    },
  ];

  const DEMO_PAGES = [
    { label: 'Sign In', path: '/login' },
    { label: 'Sign Up', path: '/signup' },
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'List', path: '/drivers' },
    { label: 'Create', path: '/drivers/new' },
    { label: 'Read', path: '/drivers/1' },
    { label: 'Update', path: '/drivers/1/edit' },
  ];

  const scrollToSection = useCallback((title: string) => {
    const id = title.toLowerCase().replace(/[\s&/]+/g, '-');
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setNavOpen(false);
  }, []);

  return (
    <RialtoProvider vibe={activeVibe} theme={darkMode ? 'dark' : 'light'}>
      <div className={styles.app} dir={rtl ? 'rtl' : undefined}>
        {/* ── Floating controls ──────────────────── */}
        <div className={styles.floatingControls}>
          <button
            className={styles.navToggle}
            onClick={() => setNavOpen((v) => !v)}
            aria-label="Toggle section navigation"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <line x1="2" y1="4" x2="14" y2="4" />
              <line x1="2" y1="8" x2="14" y2="8" />
              <line x1="2" y1="12" x2="10" y2="12" />
            </svg>
          </button>

          <FloatingControls
            darkMode={darkMode}
            onDarkModeChange={setDarkMode}
            rtl={rtl}
            onRtlChange={setRtl}
            activeVibe={activeVibe}
            onVibeChange={setActiveVibe}
          />
        </div>

        <AnimatePresence>
          {navOpen && (
            <motion.nav
              className={styles.sectionNav}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={springGentle}
            >
              <div className={styles.sectionNavHeader}>
                <span>Components</span>
                <button
                  onClick={() => setNavOpen(false)}
                  aria-label="Close navigation"
                  className={styles.sectionNavClose}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <line x1="1" y1="1" x2="9" y2="9" />
                    <line x1="9" y1="1" x2="1" y2="9" />
                  </svg>
                </button>
              </div>
              {NAV_CATEGORIES.map((cat) => (
                <div key={cat.label}>
                  <div className={styles.navCategoryLabel}>{cat.label}</div>
                  {cat.label === 'Demo Pages' ? (
                    <>
                      <button
                        className={styles.sectionNavItem}
                        onClick={() => scrollToSection('Full-Page Demos')}
                      >
                        Overview
                      </button>
                      {DEMO_PAGES.map((page) => (
                        <Link
                          key={page.path}
                          to={page.path}
                          className={styles.sectionNavItem}
                        >
                          {page.label}
                        </Link>
                      ))}
                    </>
                  ) : (
                    cat.items.map((title) => (
                      <button
                        key={title}
                        className={styles.sectionNavItem}
                        onClick={() => scrollToSection(title)}
                      >
                        {title}
                      </button>
                    ))
                  )}
                </div>
              ))}
            </motion.nav>
          )}
        </AnimatePresence>

        {/* ── Hero ─────────────────────────────── */}
        <header className={styles.hero}>
          <motion.p
            className={styles.heroEyebrow}
            initial={shouldReduceMotion ? undefined : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springGentle, delay: 0.1 }}
          >
            Design System
          </motion.p>

          <motion.h1
            className={styles.heroTitle}
            initial={shouldReduceMotion ? undefined : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springGentle, delay: 0.2 }}
          >
            Rialto
          </motion.h1>

          <motion.p
            className={styles.heroSubtitle}
            initial={shouldReduceMotion ? undefined : { opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springGentle, delay: 0.35 }}
          >
            A component library with material honesty, precision surfaces, and
            interactions that feel physical.
          </motion.p>

          <motion.div
            className={styles.heroDivider}
            initial={shouldReduceMotion ? undefined : { scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 0.5 }}
            transition={{ ...springGentle, delay: 0.5 }}
          />

          <motion.p
            className={styles.heroTagline}
            initial={shouldReduceMotion ? undefined : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.65 }}
          >
            Anodized Aluminum &middot; Gorilla Glass &middot; Tactile Controls
          </motion.p>

          <motion.div
            className={styles.heroAuth}
            initial={shouldReduceMotion ? undefined : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springGentle, delay: 0.8 }}
          >
            <Link to="/login" className={styles.heroAuthLink}>
              Sign In
            </Link>
            <span className={styles.heroAuthDot}>&middot;</span>
            <Link to="/signup" className={styles.heroAuthLink}>
              Sign Up
            </Link>
            <span className={styles.heroAuthDot}>&middot;</span>
            <Link to="/dashboard" className={styles.heroAuthLink}>
              Dashboard
            </Link>
          </motion.div>
        </header>

        {/* ━━ Form ━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className={styles.categoryDivider}>
          <span className={styles.categoryLabel}>Form</span>
        </div>

        {/* ── 01 Button ────────────────────────── */}
        <Section
          number="01"
          title="Button"
          description="The hero component. Three variants: gold primary for actions, aluminum secondary for standard interactions, ghost for quiet presence. Press them — feel the depth change."
        >
          <div className={styles.row}>
            <span className={styles.rowLabel}>Variant</span>
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
          </div>

          <div className={styles.row}>
            <span className={styles.rowLabel}>Size</span>
            <Button size="sm" variant="primary">
              Small
            </Button>
            <Button size="md" variant="primary">
              Medium
            </Button>
            <Button size="lg" variant="primary">
              Large
            </Button>
          </div>

          <div className={styles.row}>
            <span className={styles.rowLabel}>State</span>
            <Button variant="primary">Enabled</Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
            <Button variant="secondary">Enabled</Button>
            <Button variant="secondary" disabled>
              Disabled
            </Button>
            <Button variant="primary" disabled>
              Publish
            </Button>
          </div>
        </Section>

        {/* ── 02 Input ─────────────────────────── */}
        <Section
          number="02"
          title="Input"
          description="Machined recessed channels. The inner shadow suggests a physical groove carved into the aluminum surface. Focus brings the gold glow."
        >
          <div className={styles.row}>
            <span className={styles.rowLabel}>Default</span>
            <Input label="Driver Name" placeholder="e.g. Charles Leclerc" />
            <Input
              label="Chassis Number"
              placeholder="F80-001"
              hint="Alphanumeric, 6+ characters"
            />
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>State</span>
            <Input
              label="Error"
              placeholder="Required"
              error
              hint="This field is required"
            />
            <Input label="Disabled" placeholder="Not editable" disabled />
            <Input label="Read-only" value="SF-24" disabled />
            <Input
              label="Locked"
              placeholder="Requires upgrade"
              disabled
              disabledReason="Upgrade to Pro to edit this field"
            />
          </div>
        </Section>

        {/* ── 03 TextArea ────────────────────────── */}
        <Section
          number="03"
          title="TextArea"
          description="The multi-line sibling of Input. Same recessed channel and gold focus ring. Auto-resize grows with content. Character counter in monospace with over-limit warning."
        >
          <div className={styles.row}>
            <span className={styles.rowLabel}>Default</span>
            <TextArea
              label="Session Notes"
              placeholder="Describe track conditions, car behavior, setup changes..."
              rows={3}
            />
            <TextArea
              label="Engineer Feedback"
              placeholder="Notes with character limit..."
              hint="Keep it concise for the pit wall display"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={140}
            />
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Feature</span>
            <TextArea
              label="Auto-resize"
              placeholder="This field grows as you type..."
              autoResize
              rows={2}
            />
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>State</span>
            <TextArea
              label="Error"
              placeholder="Required field"
              error
              hint="Session notes are required before sign-off"
            />
            <TextArea
              label="Disabled"
              placeholder="Locked after submission"
              disabled
            />
          </div>
        </Section>

        {/* ── 04 Number Input ────────────────────── */}
        <Section
          number="04"
          title="Number Input"
          description="A precision stepper with machined +/- buttons. Hold to repeat with acceleration. Arrow keys for keyboard control. Monospace digits in a recessed channel — like adjusting a physical dial."
        >
          <div className={styles.row}>
            <span className={styles.rowLabel}>Interactive</span>
            <NumberInput
              label="Lap Count"
              value={lapCount}
              onChange={setLapCount}
              min={1}
              max={99}
              hint="1–99 laps"
            />
            <NumberInput
              label="Fuel Mix"
              value={fuelMix}
              onChange={setFuelMix}
              min={1}
              max={10}
              step={1}
              hint="Engine mapping mode"
            />
            <NumberInput
              label="Brake Bias %"
              value={brakeBias}
              onChange={setBrakeBias}
              min={50}
              max={65}
              step={0.5}
            />
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Size</span>
            <NumberInput
              label="Small"
              value={7}
              onChange={() => {}}
              size="small"
            />
            <NumberInput
              label="Large"
              value={42}
              onChange={() => {}}
              size="large"
            />
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>State</span>
            <NumberInput
              label="Error"
              value={0}
              onChange={() => {}}
              error
              hint="Out of valid range"
            />
            <NumberInput
              label="Disabled"
              value={42}
              onChange={() => {}}
              disabled
            />
          </div>
        </Section>

        {/* ── 05 Checkbox & Radio ──────────────── */}
        <Section
          number="05"
          title="Checkbox & Radio"
          description="Gold check marks and radio dots with spring animation — the same detent-snap physics as Toggle. Indeterminate state for partial selections. Radio groups with fieldset semantics."
        >
          <div className={styles.row} style={{ alignItems: 'flex-start' }}>
            <div className={styles.stack} style={{ flex: 1 }}>
              <span className={styles.rowLabel}>Checkbox</span>
              <Checkbox
                label="Traction control"
                checked={checkA}
                onCheckedChange={setCheckA}
              />
              <Checkbox
                label="ABS intervention"
                checked={checkB}
                onCheckedChange={setCheckB}
                description="Reduces braking pressure to prevent wheel lock-up"
              />
              <Checkbox
                label="Select all"
                checked={checkA && checkB && checkC}
                indeterminate={
                  (checkA || checkB || checkC) && !(checkA && checkB && checkC)
                }
                onCheckedChange={(v) => {
                  setCheckA(v);
                  setCheckB(v);
                  setCheckC(v);
                }}
              />
              <Checkbox label="Disabled option" disabled />
            </div>
            <div className={styles.stack} style={{ flex: 1 }}>
              <RadioGroup
                label="Driving Mode"
                name="showcase-driving-mode"
                value={radioValue}
                onChange={setRadioValue}
              >
                <Radio label="Comfort" value="comfort" />
                <Radio
                  label="Sport"
                  value="sport"
                  description="Sharpened throttle and steering response"
                />
                <Radio label="Race" value="race" />
                <Radio label="Wet" value="wet" disabled />
              </RadioGroup>
            </div>
          </div>
        </Section>

        {/* ── 06 Toggle ────────────────────────── */}
        <Section
          number="06"
          title="Toggle"
          description="Spring physics on the knob. The click-detent feel comes from high stiffness with controlled damping — like a physical rocker switch snapping into position."
        >
          <div className={styles.row} style={{ alignItems: 'flex-start' }}>
            <span className={styles.rowLabel}>Interactive</span>
            <div className={styles.stack}>
              <Toggle
                label="Launch control"
                checked={toggleA}
                onCheckedChange={setToggleA}
              />
              <Toggle
                label="Active aerodynamics"
                checked={toggleB}
                onCheckedChange={setToggleB}
              />
            </div>
          </div>
          <div className={styles.row} style={{ alignItems: 'flex-start' }}>
            <span className={styles.rowLabel}>State</span>
            <div className={styles.stack}>
              <Toggle label="Default off" />
              <Toggle label="Disabled off" disabled />
              <Toggle label="Disabled on" disabled checked />
              <Toggle
                label="Locked"
                disabled
                disabledReason="Feature requires enterprise plan"
              />
            </div>
          </div>
        </Section>

        {/* ── 07 Slider ────────────────────────── */}
        <Section
          number="07"
          title="Slider"
          description="Gold knob on a recessed aluminum track. Drag for immediate response — release and the knob settles with spring physics. The continuous-value counterpart to Toggle."
        >
          <div className={styles.row} style={{ alignItems: 'flex-start' }}>
            <span className={styles.rowLabel}>Interactive</span>
            <div className={styles.stack} style={{ flex: 1 }}>
              <Slider
                label="Throttle Response"
                value={throttle}
                onChange={setThrottle}
                showValue
                formatValue={(v) => `${v}%`}
              />
              <Slider
                label="Downforce"
                min={200}
                max={1000}
                step={50}
                value={downforce}
                onChange={setDownforce}
                showValue
                formatValue={(v) => `${v} kg`}
              />
            </div>
          </div>
          <div className={styles.row} style={{ alignItems: 'flex-start' }}>
            <span className={styles.rowLabel}>State</span>
            <div className={styles.stack} style={{ flex: 1 }}>
              <Slider label="Default" defaultValue={30} />
              <Slider label="Disabled" defaultValue={40} disabled />
            </div>
          </div>
        </Section>

        {/* ── 08 Select ────────────────────────── */}
        <Section
          number="08"
          title="Select"
          description="Aluminum trigger opening into a frosted glass dropdown. Spring entrance, gold check marks, full keyboard navigation — Arrow, Home, End, Escape, type-ahead."
        >
          <div className={styles.row}>
            <span className={styles.rowLabel}>Interactive</span>
            <Select
              label="Driving Mode"
              placeholder="Choose mode\u2026"
              value={drivingMode}
              onChange={setDrivingMode}
              options={[
                { value: 'comfort', label: 'Comfort' },
                { value: 'sport', label: 'Sport' },
                { value: 'race', label: 'Race' },
                { value: 'wet', label: 'Wet' },
                { value: 'esc-off', label: 'ESC Off', disabled: true },
              ]}
            />
            <Select
              label="Tyre Compound"
              placeholder="Select compound\u2026"
              options={[
                { value: 'soft', label: 'Soft (C5)' },
                { value: 'medium', label: 'Medium (C3)' },
                { value: 'hard', label: 'Hard (C1)' },
                { value: 'inter', label: 'Intermediate' },
                { value: 'wet', label: 'Full Wet' },
              ]}
            />
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>State</span>
            <Select
              label="With value"
              value="sport"
              options={[
                { value: 'comfort', label: 'Comfort' },
                { value: 'sport', label: 'Sport' },
                { value: 'race', label: 'Race' },
              ]}
            />
            <Select
              label="Disabled"
              placeholder="Not available"
              disabled
              options={[{ value: 'x', label: 'x' }]}
            />
          </div>
        </Section>

        {/* ── 09 Pin Input ──────────────────────── */}
        <Section
          number="09"
          title="Pin Input"
          description="Fixed-length code entry for 2FA and verification codes. Recessed cells with auto-advance, paste support, and spring entry animation."
        >
          <div className={styles.row}>
            <span className={styles.rowLabel}>Interactive</span>
            <PinInput
              label="Verification Code"
              hint="Try entering 1234"
              value={pin}
              onChange={setPin}
              onComplete={(v) => {
                if (v === '1234') {
                  toast({ title: 'Code verified!', variant: 'success' });
                  setPin('');
                } else {
                  toast({ title: 'Invalid code — try 1234', variant: 'error' });
                  setPin('');
                }
              }}
            />
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Length</span>
            <PinInput label="4-digit (default)" />
            <PinInput label="6-digit" length={6} />
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Type</span>
            <PinInput label="Numeric" hint="Digits only" />
            <PinInput
              label="Alphanumeric"
              type="alphanumeric"
              hint="Letters or digits"
            />
            <PinInput label="Masked" mask hint="Hidden input" />
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Size</span>
            <PinInput label="Small" size="sm" />
            <PinInput label="Medium" size="md" />
            <PinInput label="Large" size="lg" />
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>State</span>
            <PinInput label="Default" />
            <PinInput label="With value" value="42" />
            <PinInput label="Error" error hint="Invalid code" />
            <PinInput label="Disabled" disabled value="0924" />
          </div>
        </Section>

        {/* ━━ Data ━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className={styles.categoryDivider}>
          <span className={styles.categoryLabel}>Data</span>
        </div>

        {/* ── 10 Card ──────────────────────────── */}
        <Section
          number="10"
          title="Card"
          description="The jewelry box. Three surface treatments: polished aluminum elevation, frosted glass translucency, and flat for quiet grouping."
        >
          <div className={styles.cardGrid}>
            <Card title="Elevated" subtitle="Polished aluminum">
              <p
                style={{
                  fontSize: 'var(--rialto-text-sm)',
                  color: 'var(--rialto-text-secondary)',
                }}
              >
                Subtle lift with precision border. The default content
                container.
              </p>
            </Card>
            <Card
              variant="glass"
              title="Glass"
              subtitle="Frosted Gorilla Glass"
            >
              <p
                style={{
                  fontSize: 'var(--rialto-text-sm)',
                  color: 'var(--rialto-text-secondary)',
                }}
              >
                The Rialto effect — backdrop blur with warm translucency. For
                floating panels.
              </p>
            </Card>
            <Card variant="flat" title="Flat" subtitle="Brushed matte">
              <p
                style={{
                  fontSize: 'var(--rialto-text-sm)',
                  color: 'var(--rialto-text-secondary)',
                }}
              >
                Quiet presence. No shadow. For secondary groupings and nested
                content.
              </p>
            </Card>
            <Card tilt title="3D Tilt" subtitle="Hover to interact">
              <p
                style={{
                  fontSize: 'var(--rialto-text-sm)',
                  color: 'var(--rialto-text-secondary)',
                }}
              >
                Cursor-tracking tilt with specular highlight. Move your mouse
                across the card surface.
              </p>
            </Card>
          </div>
        </Section>

        {/* ── 11 Table ──────────────────────────── */}
        <Section
          number="11"
          title="Table"
          description="Aluminum header gradient, subtle row hover with gold tint, sortable columns with gold active indicator. Click any sortable header — the arrow flips between ascending and descending."
        >
          <Table
            columns={[
              { key: 'driver', header: 'Driver', sortable: true },
              {
                key: 'lap',
                header: 'Lap',
                sortable: true,
                align: 'center',
                width: '60px',
              },
              { key: 'sector1', header: 'S1', align: 'right' },
              { key: 'sector2', header: 'S2', align: 'right' },
              { key: 'sector3', header: 'S3', align: 'right' },
              { key: 'total', header: 'Total', sortable: true, align: 'right' },
              {
                key: 'delta',
                header: 'Delta',
                sortable: true,
                align: 'right',
                render: (row) => (
                  <span
                    style={{
                      color: String(row.delta).startsWith('-')
                        ? 'var(--rialto-success)'
                        : 'var(--rialto-text-tertiary)',
                    }}
                  >
                    {row.delta as string}
                  </span>
                ),
              },
            ]}
            data={LAP_DATA}
            rowKey={(row) => row.id as number}
            striped
          />
        </Section>

        {/* ── 12 Badge ─────────────────────────── */}
        <Section
          number="12"
          title="Badge"
          description="Sharp 2px radius. Tight, precise, small. Gold reserved for active/selected state only. Status dots for live indicators."
        >
          <div className={styles.row}>
            <span className={styles.rowLabel}>Variant</span>
            <Badge variant="neutral">Neutral</Badge>
            <Badge variant="accent">Active</Badge>
            <Badge variant="success">Ready</Badge>
            <Badge variant="error">Alert</Badge>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>With dot</span>
            <Badge variant="neutral" dot>
              Offline
            </Badge>
            <Badge variant="accent" dot>
              In session
            </Badge>
            <Badge variant="success" dot>
              Connected
            </Badge>
            <Badge variant="error" dot>
              Fault
            </Badge>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Small</span>
            <Badge size="sm">v4.2.1</Badge>
            <Badge size="sm" variant="accent">
              PRO
            </Badge>
            <Badge size="sm" variant="success" dot>
              Live
            </Badge>
            <Badge size="sm" variant="error">
              3
            </Badge>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>In context</span>
            <span
              style={{
                fontSize: 'var(--rialto-text-sm)',
                color: 'var(--rialto-text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--rialto-space-xs)',
              }}
            >
              Telemetry{' '}
              <Badge variant="success" dot>
                Live
              </Badge>
            </span>
            <span
              style={{
                fontSize: 'var(--rialto-text-sm)',
                color: 'var(--rialto-text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--rialto-space-xs)',
              }}
            >
              Notifications{' '}
              <Badge variant="error" size="sm">
                12
              </Badge>
            </span>
          </div>
        </Section>

        {/* ── 13 Tag ──────────────────────────── */}
        <Section
          number="13"
          title="Tag"
          description="Removable tags for filters and multi-value selections. Spring-animated dismiss, selectable toggle mode, and variant colors. The interactive cousin of Badge."
        >
          <div className={styles.row}>
            <span className={styles.rowLabel}>Variants</span>
            <Tag>Default</Tag>
            <Tag variant="accent">Accent</Tag>
            <Tag variant="success">Success</Tag>
            <Tag variant="error">Error</Tag>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Filters</span>
            {['V6', 'V8', 'V12', 'Hybrid', 'Turbo'].map((f) => (
              <Tag
                key={f}
                onClick={() =>
                  setSelectedFilters((prev) => {
                    const next = new Set(prev);
                    if (next.has(f)) {
                      next.delete(f);
                    } else {
                      next.add(f);
                    }
                    return next;
                  })
                }
                selected={selectedFilters.has(f)}
              >
                {f}
              </Tag>
            ))}
          </div>
          <div>
            <span
              className={styles.rowLabel}
              style={{
                display: 'block',
                marginBottom: 'var(--rialto-space-xs)',
              }}
            >
              Dismissible
            </span>
            <TagGroup>
              {tags.map((t) => (
                <AnimatedTag
                  key={t}
                  id={t}
                  variant="accent"
                  dismissible
                  onDismiss={() =>
                    setTags((prev) => prev.filter((x) => x !== t))
                  }
                >
                  {t}
                </AnimatedTag>
              ))}
            </TagGroup>
            {tags.length === 0 && (
              <div style={{ marginTop: 'var(--rialto-space-xs)' }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setTags(['Fiorano', 'Monza', 'Mugello', 'Imola', 'Spa'])
                  }
                >
                  Reset tags
                </Button>
              </div>
            )}
          </div>
        </Section>

        {/* ── 14 Avatar ────────────────────────── */}
        <Section
          number="14"
          title="Avatar"
          description="Machined aluminum border ring with image, initials fallback, or generic silhouette. Gold status dots for presence. Group stacking with hover lift."
        >
          <div className={styles.row}>
            <span className={styles.rowLabel}>Size</span>
            <Avatar name="Charles Leclerc" size="sm" />
            <Avatar name="Charles Leclerc" size="md" />
            <Avatar name="Charles Leclerc" size="lg" />
            <Avatar name="Charles Leclerc" size="xl" />
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Status</span>
            <Avatar name="CL" size="lg" status="online" />
            <Avatar name="MN" size="lg" status="away" />
            <Avatar name="JI" size="lg" status="busy" />
            <Avatar name="SF" size="lg" status="offline" />
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Fallback</span>
            <Avatar size="lg" />
            <Avatar name="Marc Newson" size="lg" />
            <Avatar src="https://i.pravatar.cc/128?u=a" name="Test" size="lg" />
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Group</span>
            <AvatarGroup
              size="md"
              max={3}
              avatars={[
                { name: 'Charles Leclerc', status: 'online' },
                { name: 'Lewis Hamilton', status: 'online' },
                { name: 'Marc Newson', status: 'away' },
                { name: 'Adrian Newey', status: 'busy' },
                { name: 'Adrian Newey' },
              ]}
            />
          </div>
        </Section>

        {/* ── 15 Stat ──────────────────────────── */}
        <Section
          number="15"
          title="Stat"
          description="Dashboard metric readout. Monospace value display on an aluminum surface — like a precision instrument. Trend arrows with color-coded deltas."
        >
          <div className={styles.cardGrid}>
            <Stat value="1:25.410" label="Lap Time" delta="-0.342" trend="up" />
            <Stat value="342 km/h" label="Top Speed" delta="+3" trend="up" />
            <Stat value="47%" label="Fuel" delta="-8%" trend="down" />
            <Stat value="23%" label="Brake Wear" delta="0.0%" trend="neutral" />
          </div>
          <div
            className={styles.row}
            style={{ marginTop: 'var(--rialto-space-md)' }}
          >
            <span className={styles.rowLabel}>Sizes</span>
            <Stat value="1:25" label="SM" size="sm" />
            <Stat value="1:25.410" label="MD" />
            <Stat value="1:25.410" label="LG" size="lg" />
          </div>
        </Section>

        {/* ── 16 Data List ─────────────────────── */}
        <Section
          number="16"
          title="Data List"
          description="Semantic key-value pairs using native dl/dt/dd elements. Horizontal or vertical layout with optional striped rows for dense data."
        >
          <div
            className={styles.stack}
            style={{ gap: 'var(--rialto-space-lg)' }}
          >
            <DataList
              items={[
                { label: 'Engine', value: 'Twin-turbo 3.0L V6 Hybrid' },
                { label: 'Power', value: '1,200 PS' },
                { label: 'Torque', value: '900 Nm' },
                { label: 'Weight', value: '1,250 kg' },
                { label: '0–100 km/h', value: '2.15s' },
                { label: 'Top Speed', value: '350 km/h' },
              ]}
            />
            <DataList
              orientation="horizontal"
              striped
              items={[
                { label: 'Session', value: 'FP1 — Fiorano' },
                { label: 'Ambient Temp', value: '22°C' },
                { label: 'Track Temp', value: '38°C' },
                { label: 'Humidity', value: '45%' },
                { label: 'Wind', value: '12 km/h NNW' },
              ]}
            />
          </div>
        </Section>

        {/* ── 17 Meter ─────────────────────────── */}
        <Section
          number="17"
          title="Meter"
          description="A bounded gauge for current values within a known range. Unlike Progress (which tracks completion), Meter shows a reading — fuel level, brake temperature, tire pressure."
        >
          <div className={styles.stack}>
            <Meter value={72} label="Fuel Level" showValue variant="accent" />
            <Meter
              value={88}
              label="Brake Temperature"
              showValue
              variant="error"
            />
            <Meter
              value={32}
              label="Tire Pressure"
              showValue
              variant="success"
            />
            <Meter value={56} label="Engine Load" showValue variant="default" />
          </div>
          <div
            className={styles.row}
            style={{ marginTop: 'var(--rialto-space-md)' }}
          >
            <span className={styles.rowLabel}>Small</span>
            <div style={{ flex: 1 }}>
              <Meter
                value={65}
                label="Throttle"
                showValue
                size="sm"
                variant="accent"
              />
            </div>
          </div>
        </Section>

        {/* ── 18 Kbd ──────────────────────────── */}
        <Section
          number="18"
          title="Kbd"
          description="Machined aluminum key caps with physical depth — the thicker bottom border and inner highlight create the illusion of a raised key. Shortcut combos join keys with a separator."
        >
          <div className={styles.row}>
            <span className={styles.rowLabel}>Keys</span>
            <Kbd>⌘</Kbd>
            <Kbd>Shift</Kbd>
            <Kbd>K</Kbd>
            <Kbd>⏎</Kbd>
            <Kbd>Esc</Kbd>
            <Kbd>Tab</Kbd>
            <Kbd>Space</Kbd>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Combos</span>
            <Shortcut keys={['⌘', 'K']} />
            <Shortcut keys={['⌘', 'Shift', 'P']} />
            <Shortcut keys={['Ctrl', 'C']} />
            <Shortcut keys={['Alt', 'F4']} />
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>In context</span>
            <span
              style={{
                fontSize: 'var(--rialto-text-sm)',
                color: 'var(--rialto-text-secondary)',
              }}
            >
              Press <Shortcut keys={['⌘', 'K']} /> to open command palette
            </span>
          </div>
        </Section>

        {/* ━━ Navigation ━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className={styles.categoryDivider}>
          <span className={styles.categoryLabel}>Navigation</span>
        </div>

        {/* ── 19 Tabs ──────────────────────────── */}
        <Section
          number="19"
          title="Tabs"
          description="The gold indicator slides between tabs with spring physics — the same detent-snap feel as the toggle. Arrow keys navigate. Watch the bar overshoot and settle."
        >
          <Tabs
            tabs={[
              {
                id: 'performance',
                label: 'Performance',
                content: (
                  <p
                    style={{
                      fontSize: 'var(--rialto-text-sm)',
                      color: 'var(--rialto-text-secondary)',
                      lineHeight: 'var(--rialto-leading-relaxed)',
                    }}
                  >
                    Twin-turbocharged V6 hybrid producing 1,200 PS. The most
                    powerful road car we&apos;ve ever built.
                  </p>
                ),
              },
              {
                id: 'chassis',
                label: 'Chassis',
                content: (
                  <p
                    style={{
                      fontSize: 'var(--rialto-text-sm)',
                      color: 'var(--rialto-text-secondary)',
                      lineHeight: 'var(--rialto-leading-relaxed)',
                    }}
                  >
                    Carbon fiber monocoque with aluminum subframes. Active
                    aerodynamics with adjustable downforce.
                  </p>
                ),
              },
              {
                id: 'interior',
                label: 'Interior',
                content: (
                  <p
                    style={{
                      fontSize: 'var(--rialto-text-sm)',
                      color: 'var(--rialto-text-secondary)',
                      lineHeight: 'var(--rialto-leading-relaxed)',
                    }}
                  >
                    Anodized aluminum surfaces, Gorilla Glass instrument panel,
                    physical controls with tactile feedback.
                  </p>
                ),
              },
              {
                id: 'limited',
                label: 'Availability',
                disabled: true,
                content: null,
              },
            ]}
          />
        </Section>

        {/* ── 20 Breadcrumb ──────────────────────── */}
        <Section
          number="20"
          title="Breadcrumb"
          description="Navigation trail with chevron separators. Gold hover on links, medium weight on current page. Collapses deep paths with ellipsis."
        >
          <div className={styles.stack}>
            <div>
              <span
                className={styles.rowLabel}
                style={{
                  display: 'block',
                  marginBottom: 'var(--rialto-space-xs)',
                }}
              >
                Short path
              </span>
              <Breadcrumb
                items={[
                  { label: 'Home', href: '#' },
                  { label: 'Vehicles', href: '#' },
                  { label: 'F80' },
                ]}
              />
            </div>
            <div>
              <span
                className={styles.rowLabel}
                style={{
                  display: 'block',
                  marginBottom: 'var(--rialto-space-xs)',
                }}
              >
                Deep path
              </span>
              <Breadcrumb
                items={[
                  { label: 'Home', href: '#' },
                  { label: 'Telemetry', href: '#' },
                  { label: 'Sessions', href: '#' },
                  { label: 'Fiorano', href: '#' },
                  { label: 'Lap 14' },
                ]}
              />
            </div>
            <div>
              <span
                className={styles.rowLabel}
                style={{
                  display: 'block',
                  marginBottom: 'var(--rialto-space-xs)',
                }}
              >
                Collapsed (maxItems=3)
              </span>
              <Breadcrumb
                items={[
                  { label: 'Home', href: '#' },
                  { label: 'Telemetry', href: '#' },
                  { label: 'Sessions', href: '#' },
                  { label: 'Fiorano', href: '#' },
                  { label: 'Sector Analysis', href: '#' },
                  { label: 'Lap 14' },
                ]}
                maxItems={3}
              />
            </div>
          </div>
        </Section>

        {/* ── 21 Steps ──────────────────────────────── */}
        <Section
          number="21"
          title="Steps"
          description="Multi-step progress with connected nodes — gold fill for completed, glowing ring for current. Click any step to navigate. Horizontal and vertical orientations."
        >
          <div
            className={styles.stack}
            style={{ gap: 'var(--rialto-space-xl)' }}
          >
            <div>
              <span
                className={styles.rowLabel}
                style={{
                  display: 'block',
                  marginBottom: 'var(--rialto-space-sm)',
                }}
              >
                Interactive
              </span>
              <Steps
                steps={[
                  {
                    label: 'Scrutineering',
                    description: 'Technical inspection',
                  },
                  {
                    label: 'Free Practice',
                    description: 'Setup & data collection',
                  },
                  { label: 'Qualifying', description: 'Grid position' },
                  { label: 'Warm-up', description: 'Final checks' },
                  { label: 'Race', description: 'Lights out' },
                ]}
                currentStep={wizardStep}
                onStepClick={setWizardStep}
              />
              <div
                className={styles.row}
                style={{ marginTop: 'var(--rialto-space-sm)' }}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={wizardStep === 0}
                  onClick={() => setWizardStep((s) => s - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={wizardStep === 4}
                  onClick={() => setWizardStep((s) => s + 1)}
                >
                  Next Step
                </Button>
              </div>
            </div>
            <div>
              <span
                className={styles.rowLabel}
                style={{
                  display: 'block',
                  marginBottom: 'var(--rialto-space-sm)',
                }}
              >
                Vertical orientation
              </span>
              <div className={styles.row} style={{ alignItems: 'flex-start' }}>
                <Steps
                  orientation="vertical"
                  steps={[
                    { label: 'Pre-season testing' },
                    { label: 'Race weekend' },
                    { label: 'Post-race debrief' },
                    { label: 'Development cycle' },
                  ]}
                  currentStep={1}
                />
                <Steps
                  orientation="vertical"
                  compact
                  steps={[
                    { label: 'Upload telemetry' },
                    { label: 'Run analysis' },
                    { label: 'Generate report' },
                    { label: 'Share with team' },
                  ]}
                  currentStep={2}
                />
              </div>
            </div>
          </div>
        </Section>

        {/* ── 22 Pagination ──────────────────────── */}
        <Section
          number="22"
          title="Pagination"
          description="Aluminum page buttons with gold active indicator. Ellipsis collapse keeps large ranges compact. Previous/Next arrows disable at boundaries."
        >
          <div className={styles.stack}>
            <div>
              <span
                className={styles.rowLabel}
                style={{
                  display: 'block',
                  marginBottom: 'var(--rialto-space-xs)',
                }}
              >
                Small range (5 pages)
              </span>
              <Pagination page={pageA} totalPages={5} onChange={setPageA} />
            </div>
            <div>
              <span
                className={styles.rowLabel}
                style={{
                  display: 'block',
                  marginBottom: 'var(--rialto-space-xs)',
                }}
              >
                Large range with ellipsis (20 pages)
              </span>
              <Pagination page={pageB} totalPages={20} onChange={setPageB} />
            </div>
          </div>
        </Section>

        {/* ── 23 Segmented Control ──────────────── */}
        <Section
          number="23"
          title="Segmented Control"
          description="A pill-shaped toggle for mutually exclusive options. The sliding indicator uses spring physics — watch it overshoot and settle like a physical detent."
        >
          <div className={styles.stack}>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Interactive</span>
              <SegmentedControl
                segments={[
                  { id: 'grid', label: 'Grid' },
                  { id: 'list', label: 'List' },
                  { id: 'table', label: 'Table' },
                ]}
                value={segmentedView}
                onChange={setSegmentedView}
              />
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Disabled segment</span>
              <SegmentedControl
                segments={[
                  { id: 'comfort', label: 'Comfort' },
                  { id: 'sport', label: 'Sport' },
                  { id: 'race', label: 'Race' },
                  { id: 'wet', label: 'Wet', disabled: true },
                ]}
                value="sport"
                onChange={() => {}}
              />
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Small</span>
              <SegmentedControl
                segments={[
                  { id: 'a', label: 'Alpha' },
                  { id: 'b', label: 'Beta' },
                ]}
                value="a"
                onChange={() => {}}
                size="sm"
              />
            </div>
          </div>
        </Section>

        {/* ── 24 Navigation Menu ────────────────── */}
        <Section
          number="24"
          title="Navigation Menu"
          description="Horizontal navigation with hover-triggered dropdowns. 200ms open delay and 150ms close delay allow the mouse to travel between trigger and panel."
        >
          <NavigationMenu
            items={[
              { label: 'Dashboard', href: '#' },
              {
                label: 'Telemetry',
                children: [
                  { label: 'Live Data' },
                  { label: 'Historical' },
                  { label: 'Exports' },
                ],
              },
              {
                label: 'Configuration',
                children: [
                  { label: 'Driving Mode' },
                  { label: 'Suspension' },
                  { label: 'Aero' },
                ],
              },
              { label: 'About', href: '#' },
            ]}
          />
        </Section>

        {/* ── 24b Tree ─────────────────────────── */}
        <Section
          number="24c"
          title="Tree"
          description="Hierarchical data display with expand/collapse. Best for file systems, org charts, nested categories. Single-selection with gold accent. Arrow key navigation supported."
        >
          <Tree
            data={[
              {
                id: 'src',
                label: 'src',
                children: [
                  {
                    id: 'components',
                    label: 'components',
                    children: [
                      { id: 'button', label: 'Button.tsx' },
                      { id: 'input', label: 'Input.tsx' },
                      { id: 'select', label: 'Select.tsx' },
                    ],
                  },
                  {
                    id: 'utils',
                    label: 'utils',
                    children: [
                      { id: 'helpers', label: 'helpers.ts' },
                      { id: 'format', label: 'format.ts' },
                    ],
                  },
                  { id: 'app', label: 'App.tsx' },
                  { id: 'main', label: 'main.tsx' },
                ],
              },
              {
                id: 'public',
                label: 'public',
                children: [
                  { id: 'index', label: 'index.html' },
                  { id: 'favicon', label: 'favicon.ico' },
                ],
              },
              { id: 'package', label: 'package.json' },
              { id: 'tsconfig', label: 'tsconfig.json' },
            ]}
            defaultExpanded={['src']}
          />
        </Section>

        {/* ── 25 Navbar ──────────────────────────── */}
        <Section
          number="25"
          title="Navbar"
          description="Full-featured left navbar with header, search, user section, and navigation links. Supports nested links with expand/collapse. Best for app layouts requiring persistent navigation with user context."
        >
          <div
            style={{ height: 400, overflow: 'hidden', position: 'relative' }}
          >
            <Navbar
              logo={<span>Rialto</span>}
              search={{ placeholder: 'Search...' }}
              user={{
                name: 'Alex Morgan',
                email: 'alex@company.com',
              }}
              links={[
                {
                  id: 'dashboard',
                  label: 'Dashboard',
                  icon: (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <rect x="2" y="2" width="5" height="5" rx="1" />
                      <rect x="9" y="2" width="5" height="5" rx="1" />
                      <rect x="2" y="9" width="5" height="5" rx="1" />
                      <rect x="9" y="9" width="5" height="5" rx="1" />
                    </svg>
                  ),
                },
                {
                  id: 'analytics',
                  label: 'Analytics',
                  icon: (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M2 14V8M6 14V4M10 14V10M14 14V2" />
                    </svg>
                  ),
                },
                {
                  id: 'customers',
                  label: 'Customers',
                  badge: 12,
                  icon: (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <circle cx="8" cy="5" r="3" />
                      <path d="M2 14c0-3 2-5 6-5s6 2 6 5" />
                    </svg>
                  ),
                },
                {
                  id: 'settings',
                  label: 'Settings',
                  icon: (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <circle cx="8" cy="8" r="2" />
                      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1 1M12 12l1 1M3 13l1-1M12 4l1-1" />
                    </svg>
                  ),
                  children: [
                    { id: 'profile', label: 'Profile', href: '#' },
                    { id: 'account', label: 'Account', href: '#' },
                    { id: 'security', label: 'Security', href: '#' },
                  ],
                },
              ]}
              footer={
                <Button variant="ghost" size="sm" className="w-full">
                  Sign Out
                </Button>
              }
            />
          </div>
        </Section>

        {/* ━━ Feedback ━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className={styles.categoryDivider}>
          <span className={styles.categoryLabel}>Feedback</span>
        </div>

        {/* ── 26 Toast ─────────────────────────── */}
        <Section
          number="26"
          title="Toast"
          description="Glass surface notifications that slide in with spring physics from the right. Auto-dismiss with a gold countdown bar. Stackable, dismissible, variant-coded."
        >
          <div className={styles.row}>
            <span className={styles.rowLabel}>Variants</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                toast({
                  title: 'Configuration saved',
                  description: 'Driving mode updated to Sport.',
                  variant: 'default',
                })
              }
            >
              Default
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                toast({
                  title: 'Telemetry uploaded',
                  description: 'All systems nominal.',
                  variant: 'success',
                })
              }
            >
              Success
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                toast({
                  title: 'Sensor fault detected',
                  description: 'Rear left tire pressure below threshold.',
                  variant: 'error',
                })
              }
            >
              Error
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                toast({
                  title: 'Launch control armed',
                  variant: 'accent',
                  duration: 6000,
                })
              }
            >
              Accent (6s)
            </Button>
          </div>
        </Section>

        {/* ── 27 Alert ──────────────────────────── */}
        <Section
          number="27"
          title="Alert"
          description="Persistent inline notifications — the static counterpart to Toast. Variant-coded left accent with a subtle gradient tint. Optional dismiss, optional action slot."
        >
          <div>
            <span
              className={styles.rowLabel}
              style={{
                display: 'block',
                marginBottom: 'var(--rialto-space-sm)',
              }}
            >
              Variants
            </span>
            <div className={styles.stack}>
              <Alert variant="info" title="System update available">
                Firmware v4.2.1 is ready to install. No downtime required.
              </Alert>
              <Alert variant="success" title="Telemetry sync complete">
                All 847 data points uploaded successfully.
              </Alert>
              <Alert variant="warning" title="Tire pressure low">
                Rear left tire is at 28 PSI — recommended minimum is 32 PSI.
              </Alert>
              <Alert variant="error" title="Sensor fault">
                Front brake temperature sensor is not responding. Service
                required before next session.
              </Alert>
            </div>
          </div>
          <div style={{ marginTop: 'var(--rialto-space-lg)' }}>
            <span
              className={styles.rowLabel}
              style={{
                display: 'block',
                marginBottom: 'var(--rialto-space-sm)',
              }}
            >
              Features
            </span>
            <div className={styles.stack}>
              <Alert variant="info" title="Dismissible alert" dismissible>
                This alert can be closed with the dismiss button.
              </Alert>
              <Alert
                variant="warning"
                title="With action"
                actions={
                  <Button variant="secondary" size="sm">
                    View Details
                  </Button>
                }
              >
                Adaptive suspension calibration may need adjustment for current
                track conditions.
              </Alert>
            </div>
          </div>
        </Section>

        {/* ── 28 Banner ────────────────────────── */}
        <Section
          number="28"
          title="Banner"
          description="Full-width persistent notification strip — the page-level counterpart to Alert. Variant-coded left border with gradient tint. Optional dismiss and action slot."
        >
          <div>
            <span
              className={styles.rowLabel}
              style={{
                display: 'block',
                marginBottom: 'var(--rialto-space-sm)',
              }}
            >
              Variants
            </span>
            <div className={styles.stack}>
              <Banner variant="info">
                Firmware v4.2.1 is available. No downtime required.
              </Banner>
              <Banner variant="error" dismissible>
                Front brake temperature sensor is not responding. Service
                required.
              </Banner>
              <Banner variant="accent">
                Launch control armed — standing start sequence initiated.
              </Banner>
            </div>
          </div>
          <div style={{ marginTop: 'var(--rialto-space-lg)' }}>
            <span
              className={styles.rowLabel}
              style={{
                display: 'block',
                marginBottom: 'var(--rialto-space-sm)',
              }}
            >
              With action
            </span>
            <Banner
              variant="warning"
              action={
                <Button variant="secondary" size="sm">
                  Review
                </Button>
              }
            >
              Tire pressure below recommended threshold on rear left.
            </Banner>
          </div>
        </Section>

        {/* ── 28 Progress ────────────────────────── */}
        <Section
          number="28"
          title="Progress"
          description="Gold accent fill advancing through an aluminum channel. Determinate bar for known values, indeterminate shimmer for unknown, orbital spinner for AI-ready loading."
        >
          <div className={styles.stack}>
            <Progress value={72} label="Telemetry upload" showValue />
            <Progress value={35} label="Diagnostics" showValue size="sm" />
            <Progress label="Processing" />
            <Progress value={100} label="Complete" showValue />
          </div>
          <div
            className={styles.row}
            style={{ marginTop: 'var(--rialto-space-lg)' }}
          >
            <span className={styles.rowLabel}>Spinner</span>
            <Spinner size="sm" />
            <Spinner size="md" />
            <Spinner size="lg" />
          </div>
        </Section>

        {/* ── 29 Skeleton ──────────────────────── */}
        <Section
          number="29"
          title="Skeleton"
          description="Gold-tinted shimmer sweeps across recessed surfaces. Shape variants match the content they replace — text lines, headings, circles, rectangles. Compose them for realistic loading states."
        >
          <div className={styles.row}>
            <span className={styles.rowLabel}>Shapes</span>
            <Skeleton variant="circle" width={40} />
            <Skeleton variant="text" width={120} />
            <Skeleton variant="heading" width={180} />
            <Skeleton variant="rect" width={80} height={40} />
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Lines</span>
            <div style={{ flex: 1 }}>
              <Skeleton variant="text" lines={3} width="100%" />
            </div>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Card</span>
            <SkeletonGroup>
              <Card style={{ width: 320 }}>
                <div
                  style={{
                    display: 'flex',
                    gap: 'var(--rialto-space-sm)',
                    alignItems: 'center',
                    marginBottom: 'var(--rialto-space-sm)',
                  }}
                >
                  <Skeleton variant="circle" width={36} />
                  <div style={{ flex: 1 }}>
                    <Skeleton variant="heading" width="60%" />
                    <div style={{ height: 6 }} />
                    <Skeleton variant="text" width="40%" />
                  </div>
                </div>
                <Skeleton variant="rect" width="100%" height={80} />
                <div style={{ height: 8 }} />
                <Skeleton variant="text" lines={2} width="100%" />
              </Card>
            </SkeletonGroup>
          </div>
        </Section>

        {/* ── 30 Empty State ──────────────────── */}
        <Section
          number="30"
          title="Empty State"
          description="A centered composition for 'no data' moments — empty tables, blank dashboards, post-deletion confirmations. Icon + heading + description + optional action in a vertical stack."
        >
          <div
            className={styles.stack}
            style={{ gap: 'var(--rialto-space-lg)' }}
          >
            <div>
              <span
                className={styles.rowLabel}
                style={{
                  display: 'block',
                  marginBottom: 'var(--rialto-space-sm)',
                }}
              >
                Default with action
              </span>
              <EmptyState
                heading="No sessions found"
                description="You haven't recorded any telemetry sessions yet. Start a new session to begin collecting data."
                action={
                  <Button variant="primary" size="sm">
                    New Session
                  </Button>
                }
              />
            </div>

            <div>
              <span
                className={styles.rowLabel}
                style={{
                  display: 'block',
                  marginBottom: 'var(--rialto-space-sm)',
                }}
              >
                Elevated variant
              </span>
              <EmptyState
                variant="elevated"
                heading="No lap data"
                description="Complete a lap to see timing and sector analysis here."
                action={
                  <Button variant="secondary" size="sm">
                    Go to Track
                  </Button>
                }
              />
            </div>

            <div>
              <span
                className={styles.rowLabel}
                style={{
                  display: 'block',
                  marginBottom: 'var(--rialto-space-sm)',
                }}
              >
                Small
              </span>
              <EmptyState
                size="sm"
                heading="No alerts"
                description="All systems nominal. Alerts will appear here when triggered."
              />
            </div>

            <div>
              <span
                className={styles.rowLabel}
                style={{
                  display: 'block',
                  marginBottom: 'var(--rialto-space-sm)',
                }}
              >
                Custom icon
              </span>
              <EmptyState
                icon={
                  <svg
                    viewBox="0 0 40 40"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="20" cy="20" r="14" />
                    <path d="M20 12v8l5 3" />
                  </svg>
                }
                heading="Session expired"
                description="Your telemetry session has timed out. Reconnect to continue live monitoring."
                action={
                  <Button variant="primary" size="sm">
                    Reconnect
                  </Button>
                }
              />
            </div>

            <div>
              <span
                className={styles.rowLabel}
                style={{
                  display: 'block',
                  marginBottom: 'var(--rialto-space-sm)',
                }}
              >
                Minimal
              </span>
              <EmptyState heading="No filters applied" />
            </div>
          </div>
        </Section>

        {/* ━━ Overlays ━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className={styles.categoryDivider}>
          <span className={styles.categoryLabel}>Overlays</span>
        </div>

        {/* ── 31 Dialog ────────────────────────── */}
        <Section
          number="31"
          title="Dialog"
          description="Glass surface with backdrop blur. Spring physics entrance from below. Warm overlay tint — never pure black."
        >
          <Button onClick={() => setDialogOpen(true)}>Open Dialog</Button>

          <Dialog
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            title="Confirm Configuration"
            description="This will apply the selected driving mode to all vehicle systems. The change takes effect immediately."
            footer={
              <>
                <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => setDialogOpen(false)}>
                  Confirm
                </Button>
              </>
            }
          />
        </Section>

        {/* ── 32 Confirm Dialog ────────────────── */}
        <Section
          number="32"
          title="Confirm Dialog"
          description="A focused wrapper around Dialog for confirm/cancel patterns. Default variant auto-focuses the confirm button; destructive auto-focuses cancel to prevent accidental clicks."
        >
          <div className={styles.row}>
            <Button
              variant="secondary"
              onClick={() => setConfirmResetOpen(true)}
            >
              Confirm Configuration
            </Button>
            <ConfirmDialog
              open={confirmResetOpen}
              onConfirm={() => {
                toast({ title: 'Configuration applied', variant: 'success' });
                setConfirmResetOpen(false);
              }}
              onCancel={() => setConfirmResetOpen(false)}
              title="Confirm Configuration"
              description="This will apply the selected driving mode to all vehicle systems. The change takes effect immediately."
            />
            <Button variant="ghost" onClick={() => setConfirmDeleteOpen(true)}>
              Delete Session
            </Button>
            <ConfirmDialog
              open={confirmDeleteOpen}
              onConfirm={() => {
                toast({ title: 'Session deleted', variant: 'error' });
                setConfirmDeleteOpen(false);
              }}
              onCancel={() => setConfirmDeleteOpen(false)}
              title="Delete Session"
              description="This action cannot be undone. All telemetry data for this session will be permanently removed."
              confirmLabel="Delete"
              cancelLabel="Keep"
              variant="destructive"
            />
          </div>
        </Section>

        {/* ── 33 Drawer ─────────────────────────────── */}
        <Section
          number="33"
          title="Drawer"
          description="Slide-out panels from any screen edge — glass surface with spring physics entrance. The contextual counterpart to Dialog: augments rather than interrupts."
        >
          <div className={styles.row}>
            <span className={styles.rowLabel}>Side</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDrawerRight(true)}
            >
              Right (default)
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDrawerLeft(true)}
            >
              Left
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDrawerBottom(true)}
            >
              Bottom
            </Button>
          </div>

          <Drawer
            open={drawerRight}
            onClose={() => setDrawerRight(false)}
            title="Session Settings"
            description="Configure telemetry and driving parameters for the current session."
            footer={
              <>
                <Button variant="ghost" onClick={() => setDrawerRight(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => setDrawerRight(false)}>
                  Apply
                </Button>
              </>
            }
          >
            <div className={styles.stack}>
              <Input label="Session Name" placeholder="FP1 — Fiorano" />
              <Select
                label="Tire Compound"
                placeholder="Select compound…"
                value=""
                onChange={() => {}}
                options={[
                  { value: 'soft', label: 'Soft (C5)' },
                  { value: 'medium', label: 'Medium (C3)' },
                  { value: 'hard', label: 'Hard (C1)' },
                ]}
              />
              <Toggle
                label="Live telemetry streaming"
                checked={toggleA}
                onCheckedChange={setToggleA}
              />
            </div>
          </Drawer>

          <Drawer
            open={drawerLeft}
            onClose={() => setDrawerLeft(false)}
            side="left"
            title="Navigation"
          >
            <nav className={styles.stack}>
              {[
                { label: 'Dashboard', active: true },
                { label: 'Telemetry' },
                { label: 'Lap Analysis' },
                { label: 'Setup Sheets' },
                { label: 'Tire Strategy' },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setDrawerLeft(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--rialto-space-sm)',
                    padding: 'var(--rialto-space-xs) var(--rialto-space-sm)',
                    borderRadius: 'var(--rialto-radius-default)',
                    border: 'none',
                    background: item.active
                      ? 'var(--rialto-accent-muted)'
                      : 'transparent',
                    color: item.active
                      ? 'var(--rialto-accent)'
                      : 'var(--rialto-text-secondary)',
                    fontSize: 'var(--rialto-text-sm)',
                    fontFamily: 'var(--rialto-font-sans)',
                    fontWeight: item.active
                      ? 'var(--rialto-weight-medium)'
                      : 'var(--rialto-weight-regular)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {item.label}
                </button>
              ))}
              <Divider spacing="compact" />
              <button
                type="button"
                onClick={() => setDrawerLeft(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: 'var(--rialto-space-xs) var(--rialto-space-sm)',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--rialto-text-tertiary)',
                  fontSize: 'var(--rialto-text-xs)',
                  fontFamily: 'var(--rialto-font-sans)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                Settings
              </button>
            </nav>
          </Drawer>

          <Drawer
            open={drawerBottom}
            onClose={() => setDrawerBottom(false)}
            side="bottom"
            title="Quick Actions"
            description="Bottom sheets are ideal for mobile-first interactions and contextual toolbars."
          >
            <div className={styles.row} style={{ flexWrap: 'wrap' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDrawerBottom(false)}
              >
                Share
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDrawerBottom(false)}
              >
                Export
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDrawerBottom(false)}
              >
                Duplicate
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDrawerBottom(false)}
              >
                Cancel
              </Button>
            </div>
          </Drawer>
        </Section>

        {/* ── 34 Command Palette ──────────────────── */}
        <Section
          number="34"
          title="Command Palette"
          description="⌘K-style action launcher — glass panel, fuzzy search, full keyboard navigation. Grouped commands with shortcut hints. The power-user pattern, built for AI-ready interfaces."
        >
          <Button onClick={() => setCmdPaletteOpen(true)}>
            Open Command Palette
          </Button>

          <CommandPalette
            open={cmdPaletteOpen}
            onOpenChange={setCmdPaletteOpen}
            items={cmdItems}
            placeholder="Search commands…"
            groups={['Actions', 'Navigation', 'Preferences']}
          />
        </Section>

        {/* ── 35 Tooltip ───────────────────────── */}
        <Section
          number="35"
          title="Tooltip"
          description="Glass surface floating labels. Precision easing entrance with a subtle scale — appears from the direction it points. Hover or focus the buttons below."
        >
          <div className={styles.row}>
            <span className={styles.rowLabel}>Placement</span>
            <Tooltip content="Top placement" placement="top">
              <Button variant="secondary" size="sm">
                Top
              </Button>
            </Tooltip>
            <Tooltip content="Bottom placement" placement="bottom">
              <Button variant="secondary" size="sm">
                Bottom
              </Button>
            </Tooltip>
            <Tooltip content="Left placement" placement="left">
              <Button variant="secondary" size="sm">
                Left
              </Button>
            </Tooltip>
            <Tooltip content="Right placement" placement="right">
              <Button variant="secondary" size="sm">
                Right
              </Button>
            </Tooltip>
          </div>
          <div
            className={styles.row}
            style={{ marginTop: 'var(--rialto-space-sm)' }}
          >
            <span className={styles.rowLabel}>Long content</span>
            <Tooltip
              content="Confirm configuration and apply driving mode"
              placement="top"
            >
              <Button variant="primary" size="sm">
                Hover for details
              </Button>
            </Tooltip>
          </div>
        </Section>

        {/* ── 36 Popover ──────────────────────── */}
        <Section
          number="36"
          title="Popover"
          description="Click-triggered floating content panels — richer than Tooltip, lighter than Dialog. Glass surface with spring entrance. Click outside or press Escape to dismiss."
        >
          <div className={styles.row}>
            <Popover
              trigger={
                <Button variant="secondary" size="sm">
                  Bottom (default)
                </Button>
              }
              title="Telemetry Info"
            >
              <p>
                Current session: Fiorano, Lap 14. Ambient temperature 22°C,
                track temperature 38°C.
              </p>
            </Popover>
            <Popover
              trigger={
                <Button variant="secondary" size="sm">
                  Top
                </Button>
              }
              title="Tire Pressure"
              placement="top"
            >
              <p style={{ marginBottom: 'var(--rialto-space-xs)' }}>
                FL: 32.1 PSI &middot; FR: 31.8 PSI
              </p>
              <p>RL: 28.4 PSI &middot; RR: 31.2 PSI</p>
            </Popover>
            <Popover
              trigger={
                <Button variant="secondary" size="sm">
                  With actions
                </Button>
              }
              title="Session Export"
            >
              <p style={{ marginBottom: 'var(--rialto-space-sm)' }}>
                Export the current telemetry session data for offline analysis.
              </p>
              <div style={{ display: 'flex', gap: 'var(--rialto-space-xs)' }}>
                <Button variant="primary" size="sm">
                  Export CSV
                </Button>
                <Button variant="ghost" size="sm">
                  Cancel
                </Button>
              </div>
            </Popover>
          </div>
        </Section>

        {/* ── 37 Hover Card ────────────────────── */}
        <Section
          number="37"
          title="Hover Card"
          description="Hover-triggered rich preview — a hybrid of Tooltip's hover mechanics and Popover's glass panel. The close delay lets your mouse travel from trigger into the panel without it vanishing. For user profiles, link previews, data point details."
        >
          <div className={styles.row}>
            <HoverCard
              content={
                <div
                  style={{
                    display: 'flex',
                    gap: 'var(--rialto-space-sm)',
                    alignItems: 'flex-start',
                  }}
                >
                  <Avatar name="Charles Leclerc" size="lg" status="online" />
                  <div>
                    <p
                      style={{
                        fontSize: 'var(--rialto-text-sm)',
                        fontWeight: 'var(--rialto-weight-medium)',
                        color: 'var(--rialto-text-primary)',
                        margin: 0,
                      }}
                    >
                      Charles Leclerc
                    </p>
                    <p
                      style={{
                        fontSize: 'var(--rialto-text-xs)',
                        color: 'var(--rialto-text-tertiary)',
                        margin: '2px 0 var(--rialto-space-xs)',
                      }}
                    >
                      Lead Driver &middot; Racing Team
                    </p>
                    <div
                      style={{ display: 'flex', gap: 'var(--rialto-space-sm)' }}
                    >
                      <Badge variant="success" dot>
                        Active
                      </Badge>
                      <Badge variant="accent">P1</Badge>
                    </div>
                  </div>
                </div>
              }
            >
              <span
                style={{
                  fontSize: 'var(--rialto-text-sm)',
                  color: 'var(--rialto-accent)',
                  cursor: 'pointer',
                  borderBottom: '1px dashed var(--rialto-accent-muted)',
                  paddingBottom: 1,
                }}
              >
                Charles Leclerc
              </span>
            </HoverCard>

            <HoverCard
              content={
                <div>
                  <p
                    style={{
                      fontSize: 'var(--rialto-text-xs)',
                      fontWeight: 'var(--rialto-weight-medium)',
                      color: 'var(--rialto-text-primary)',
                      margin: '0 0 var(--rialto-space-xs)',
                    }}
                  >
                    Lap 14 — Sector Breakdown
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      gap: 'var(--rialto-space-md)',
                      fontSize: 'var(--rialto-text-xs)',
                    }}
                  >
                    <div>
                      <span style={{ color: 'var(--rialto-text-tertiary)' }}>
                        S1
                      </span>
                      <p
                        style={{
                          margin: '2px 0 0',
                          fontFamily: 'var(--rialto-font-mono)',
                          color: 'var(--rialto-text-primary)',
                        }}
                      >
                        28.412
                      </p>
                    </div>
                    <div>
                      <span style={{ color: 'var(--rialto-text-tertiary)' }}>
                        S2
                      </span>
                      <p
                        style={{
                          margin: '2px 0 0',
                          fontFamily: 'var(--rialto-font-mono)',
                          color: 'var(--rialto-text-primary)',
                        }}
                      >
                        34.891
                      </p>
                    </div>
                    <div>
                      <span style={{ color: 'var(--rialto-text-tertiary)' }}>
                        S3
                      </span>
                      <p
                        style={{
                          margin: '2px 0 0',
                          fontFamily: 'var(--rialto-font-mono)',
                          color: 'var(--rialto-success)',
                        }}
                      >
                        22.107
                      </p>
                    </div>
                  </div>
                  <p
                    style={{
                      margin: 'var(--rialto-space-xs) 0 0',
                      fontFamily: 'var(--rialto-font-mono)',
                      fontSize: 'var(--rialto-text-sm)',
                      color: 'var(--rialto-text-primary)',
                    }}
                  >
                    1:25.410{' '}
                    <span style={{ color: 'var(--rialto-success)' }}>
                      −0.342
                    </span>
                  </p>
                </div>
              }
            >
              <span
                style={{
                  fontSize: 'var(--rialto-text-sm)',
                  fontFamily: 'var(--rialto-font-mono)',
                  color: 'var(--rialto-text-secondary)',
                  cursor: 'pointer',
                  borderBottom: '1px dashed var(--rialto-border-strong)',
                  paddingBottom: 1,
                }}
              >
                1:25.410
              </span>
            </HoverCard>
          </div>

          <div className={styles.row}>
            <HoverCard
              placement="top"
              content={
                <div
                  style={{
                    display: 'flex',
                    gap: 'var(--rialto-space-sm)',
                    alignItems: 'flex-start',
                  }}
                >
                  <Avatar name="Marc Newson" size="lg" status="away" />
                  <div>
                    <p
                      style={{
                        fontSize: 'var(--rialto-text-sm)',
                        fontWeight: 'var(--rialto-weight-medium)',
                        color: 'var(--rialto-text-primary)',
                        margin: 0,
                      }}
                    >
                      Marc Newson
                    </p>
                    <p
                      style={{
                        fontSize: 'var(--rialto-text-xs)',
                        color: 'var(--rialto-text-tertiary)',
                        margin: '2px 0 var(--rialto-space-xs)',
                      }}
                    >
                      Industrial Designer
                    </p>
                    <Badge variant="neutral" dot>
                      Away
                    </Badge>
                  </div>
                </div>
              }
            >
              <Button variant="ghost" size="sm">
                Top placement
              </Button>
            </HoverCard>

            <HoverCard
              openDelay={200}
              content={
                <p style={{ margin: 0 }}>
                  Eager preview — 200ms open delay instead of the default 400ms.
                  Useful when the preview is expected and frequently accessed.
                </p>
              }
            >
              <Button variant="secondary" size="sm">
                Short delay (200ms)
              </Button>
            </HoverCard>
          </div>
        </Section>

        {/* ── 38 Dropdown Menu ───────────────────── */}
        <Section
          number="38"
          title="Dropdown Menu"
          description="Action menus with glass surface, keyboard navigation, section labels, shortcut hints, and destructive items. The action-oriented counterpart to Select."
        >
          <div className={styles.row}>
            <DropdownMenu
              trigger={
                <Button variant="secondary" size="sm">
                  Actions
                </Button>
              }
              items={[
                {
                  id: 'copy',
                  label: 'Copy',
                  shortcut: '\u2318C',
                  onSelect: () =>
                    toast({ title: 'Copied to clipboard', variant: 'default' }),
                },
                {
                  id: 'paste',
                  label: 'Paste',
                  shortcut: '\u2318V',
                  onSelect: () =>
                    toast({ title: 'Pasted', variant: 'default' }),
                },
                { type: 'divider' },
                { type: 'label', label: 'Telemetry' },
                {
                  id: 'export',
                  label: 'Export Data',
                  onSelect: () =>
                    toast({ title: 'Exporting\u2026', variant: 'accent' }),
                },
                {
                  id: 'share',
                  label: 'Share Report',
                  onSelect: () =>
                    toast({ title: 'Link copied', variant: 'success' }),
                },
                { id: 'archive', label: 'Archive', disabled: true },
                { type: 'divider' },
                {
                  id: 'reset',
                  label: 'Reset to Factory',
                  destructive: true,
                  onSelect: () =>
                    toast({ title: 'Configuration reset', variant: 'error' }),
                },
              ]}
            />
            <DropdownMenu
              trigger={
                <Button variant="secondary" size="sm">
                  Right-aligned
                </Button>
              }
              align="right"
              items={[
                { id: 'settings', label: 'Settings', shortcut: '\u2318,' },
                { id: 'preferences', label: 'Preferences' },
                { type: 'divider' },
                { id: 'logout', label: 'Sign Out', destructive: true },
              ]}
            />
          </div>
        </Section>

        {/* ── 39 Context Menu ──────────────────── */}
        <Section
          number="39"
          title="Context Menu"
          description="Right-click triggered action menu. Reuses the same item pattern as Dropdown Menu — keyboard navigation, dividers, destructive items. Fixed position at click coordinates with viewport boundary detection."
        >
          <ContextMenu
            items={[
              { id: 'copy', label: 'Copy', shortcut: '\u2318C' },
              { id: 'paste', label: 'Paste', shortcut: '\u2318V' },
              { type: 'divider' },
              { type: 'label', label: 'Telemetry' },
              { id: 'export', label: 'Export' },
              { id: 'share', label: 'Share' },
              { type: 'divider' },
              { id: 'delete', label: 'Delete', destructive: true },
            ]}
          >
            <Card
              style={{ padding: 'var(--rialto-space-xl)', textAlign: 'center' }}
            >
              <Text variant="caption" color="tertiary">
                Right-click this area
              </Text>
            </Card>
          </ContextMenu>
        </Section>

        {/* ━━ Layout ━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className={styles.categoryDivider}>
          <span className={styles.categoryLabel}>Layout</span>
        </div>

        {/* ── 40 Divider ──────────────────────── */}
        <Section
          number="40"
          title="Divider"
          description="Machined edge gradient separators. The gradient fades at both ends like a milled groove catching light. Optional centered label and gold accent variant."
        >
          <div className={styles.stack}>
            <Divider />
            <Divider label="Section" />
            <Divider accent />
            <Divider accent label="Telemetry" />
          </div>
          <div
            className={styles.row}
            style={{ height: 60, marginTop: 'var(--rialto-space-md)' }}
          >
            <span className={styles.rowLabel}>Vertical</span>
            <span
              style={{
                fontSize: 'var(--rialto-text-sm)',
                color: 'var(--rialto-text-secondary)',
              }}
            >
              Left
            </span>
            <Divider orientation="vertical" />
            <span
              style={{
                fontSize: 'var(--rialto-text-sm)',
                color: 'var(--rialto-text-secondary)',
              }}
            >
              Center
            </span>
            <Divider orientation="vertical" accent />
            <span
              style={{
                fontSize: 'var(--rialto-text-sm)',
                color: 'var(--rialto-text-secondary)',
              }}
            >
              Right
            </span>
          </div>
        </Section>

        {/* ── 41 Text ────────────────────────── */}
        <Section
          number="41"
          title="Text"
          description="Typography primitive with named presets. Each variant maps to a combination of size, weight, color, and tracking from the type scale. Override any default with individual props."
        >
          <div className={styles.stack}>
            <Text variant="display">1:24.892</Text>
            <Text variant="body">
              The default body text. Regular weight, primary color, relaxed line
              height for comfortable reading.
            </Text>
            <Text variant="caption">
              Caption text — smaller, secondary color. Ideal for supplementary
              information beneath a heading.
            </Text>
            <Text variant="detail">
              Detail text — the smallest size, tertiary color. Timestamps,
              metadata, footnotes.
            </Text>
            <Text variant="label">Telemetry active</Text>
          </div>
          <div
            className={styles.row}
            style={{ marginTop: 'var(--rialto-space-md)' }}
          >
            <span className={styles.rowLabel}>Color</span>
            <Text variant="caption" color="primary" as="span">
              Primary
            </Text>
            <Text variant="caption" color="secondary" as="span">
              Secondary
            </Text>
            <Text variant="caption" color="tertiary" as="span">
              Tertiary
            </Text>
            <Text variant="caption" color="accent" as="span">
              Accent
            </Text>
            <Text variant="caption" color="success" as="span">
              Success
            </Text>
            <Text variant="caption" color="error" as="span">
              Error
            </Text>
          </div>
          <div
            className={styles.row}
            style={{ marginTop: 'var(--rialto-space-md)' }}
          >
            <span className={styles.rowLabel}>Mono</span>
            <Text variant="caption" mono as="span">
              28.412s
            </Text>
            <Text variant="detail" mono as="span">
              0x1A2B3C
            </Text>
          </div>
          <div style={{ maxWidth: 240, marginTop: 'var(--rialto-space-md)' }}>
            <span
              className={styles.rowLabel}
              style={{
                display: 'block',
                marginBottom: 'var(--rialto-space-xs)',
              }}
            >
              Truncate
            </span>
            <Text variant="caption" truncate>
              This is a very long line of text that should be truncated with an
              ellipsis when it overflows its container width.
            </Text>
          </div>
        </Section>

        {/* ── 42 Stack ────────────────────────── */}
        <Section
          number="42"
          title="Stack"
          description="Flex layout primitive. Vertical by default, with gap mapped to the spacing scale. Replaces one-off CSS flex containers throughout the system."
        >
          <Stack gap="md">
            <div>
              <Text variant="label">Vertical (default)</Text>
              <Stack gap="xs" style={{ marginTop: 'var(--rialto-space-xs)' }}>
                <Badge variant="neutral">First</Badge>
                <Badge variant="neutral">Second</Badge>
                <Badge variant="neutral">Third</Badge>
              </Stack>
            </div>
            <div>
              <Text variant="label">Horizontal</Text>
              <Stack
                direction="row"
                gap="xs"
                align="center"
                style={{ marginTop: 'var(--rialto-space-xs)' }}
              >
                <Badge variant="accent">Speed</Badge>
                <Badge variant="success">Nominal</Badge>
                <Badge variant="error">Alert</Badge>
                <Text variant="detail" as="span">
                  3 channels active
                </Text>
              </Stack>
            </div>
            <div>
              <Text variant="label">Row with wrap</Text>
              <Stack
                direction="row"
                gap="xs"
                wrap
                style={{ marginTop: 'var(--rialto-space-xs)' }}
              >
                {[
                  'Fiorano',
                  'Monza',
                  'Mugello',
                  'Imola',
                  'Spa',
                  'Silverstone',
                  'Suzuka',
                  'Monaco',
                ].map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
              </Stack>
            </div>
            <div>
              <Text variant="label">Justify between</Text>
              <Stack
                direction="row"
                gap="sm"
                align="center"
                justify="between"
                style={{ marginTop: 'var(--rialto-space-xs)' }}
              >
                <Text variant="caption" as="span">
                  Telemetry v4.2.1
                </Text>
                <Button variant="ghost" size="sm">
                  View Details
                </Button>
              </Stack>
            </div>
          </Stack>
        </Section>

        {/* ── 43 Collapsible ───────────────────── */}
        <Section
          number="43"
          title="Collapsible"
          description="A simpler sibling to Accordion — single expandable section with spring-animated height and chevron rotation. Supports controlled and uncontrolled modes."
        >
          <div className={styles.stack}>
            <Collapsible trigger="Powertrain Specifications" defaultOpen>
              Twin-turbocharged 3.0L V6 paired with three electric motors.
              Combined output of 1,200 PS with instant torque delivery from the
              hybrid system.
            </Collapsible>
            <Collapsible trigger="Active Aerodynamics">
              Adaptive front splitter, active rear wing, and underbody venturi
              tunnels. Over 1,000 kg of downforce at 250 km/h.
            </Collapsible>
            <Collapsible
              trigger="Controlled toggle"
              open={collapsibleOpen}
              onOpenChange={setCollapsibleOpen}
            >
              This section is controlled externally.
            </Collapsible>
            <div className={styles.row}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCollapsibleOpen((v) => !v)}
              >
                {collapsibleOpen ? 'Close' : 'Open'} externally
              </Button>
            </div>
            <Collapsible trigger="Disabled section" disabled>
              This content should not be visible.
            </Collapsible>
          </div>
        </Section>

        {/* ── 44 Accordion ─────────────────────── */}
        <Section
          number="44"
          title="Accordion"
          description="Spring-animated expanding panels. The chevron rotates with gentle spring physics. Single or multiple open modes."
        >
          <Accordion
            items={[
              {
                id: 'powertrain',
                title: 'Powertrain',
                content:
                  'Twin-turbocharged 3.0L V6 paired with three electric motors. Combined output of 1,200 PS with instant torque delivery from the hybrid system.',
              },
              {
                id: 'aero',
                title: 'Active Aerodynamics',
                content:
                  'Adaptive front splitter, active rear wing, and underbody venturi tunnels. The system generates over 1,000kg of downforce at 250 km/h while maintaining a drag coefficient of 0.32.',
              },
              {
                id: 'interior',
                title: 'Interior',
                content:
                  'Anodized aluminum surfaces replace traditional leather and plastic. A single piece of Gorilla Glass spans the instrument panel. Every physical control has been designed with distinct tactile feedback — rotary dials click with precision, buttons have deliberate resistance.',
              },
              {
                id: 'production',
                title: 'Production',
                disabled: true,
                content: null,
              },
            ]}
            defaultOpen={['powertrain']}
          />
        </Section>

        {/* ── 45 Aspect Ratio ──────────────────── */}
        <Section
          number="45"
          title="Aspect Ratio"
          description="Pure CSS layout utility that maintains content proportions. Uses the native aspect-ratio property with an absolute-positioned inner container."
        >
          <div className={styles.row}>
            <span className={styles.rowLabel}>Ratio</span>
            <div style={{ width: 200 }}>
              <AspectRatio ratio={16 / 9}>
                <div
                  style={{
                    background: 'var(--rialto-surface-matte)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 'var(--rialto-radius-soft)',
                    fontFamily: 'var(--rialto-font-mono)',
                    fontSize: 'var(--rialto-text-xs)',
                    color: 'var(--rialto-text-tertiary)',
                  }}
                >
                  16:9
                </div>
              </AspectRatio>
            </div>
            <div style={{ width: 160 }}>
              <AspectRatio ratio={4 / 3}>
                <div
                  style={{
                    background: 'var(--rialto-surface-matte)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 'var(--rialto-radius-soft)',
                    fontFamily: 'var(--rialto-font-mono)',
                    fontSize: 'var(--rialto-text-xs)',
                    color: 'var(--rialto-text-tertiary)',
                  }}
                >
                  4:3
                </div>
              </AspectRatio>
            </div>
            <div style={{ width: 120 }}>
              <AspectRatio ratio={1}>
                <div
                  style={{
                    background: 'var(--rialto-surface-matte)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 'var(--rialto-radius-soft)',
                    fontFamily: 'var(--rialto-font-mono)',
                    fontSize: 'var(--rialto-text-xs)',
                    color: 'var(--rialto-text-tertiary)',
                  }}
                >
                  1:1
                </div>
              </AspectRatio>
            </div>
            <div style={{ width: 240 }}>
              <AspectRatio ratio={21 / 9}>
                <div
                  style={{
                    background: 'var(--rialto-surface-matte)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 'var(--rialto-radius-soft)',
                    fontFamily: 'var(--rialto-font-mono)',
                    fontSize: 'var(--rialto-text-xs)',
                    color: 'var(--rialto-text-tertiary)',
                  }}
                >
                  21:9
                </div>
              </AspectRatio>
            </div>
          </div>
        </Section>

        {/* ── 46 Scroll Area ───────────────────── */}
        <Section
          number="46"
          title="Scroll Area"
          description="Custom-styled scrollbar container. Thin 6px thumb on transparent track, matching the aluminum surface palette. Keyboard-scrollable with focus ring."
        >
          <div className={styles.row} style={{ alignItems: 'flex-start' }}>
            <Card style={{ flex: 1 }}>
              <ScrollArea maxHeight={200}>
                {Array.from({ length: 15 }, (_, i) => (
                  <div
                    key={i}
                    style={{
                      padding: 'var(--rialto-space-xs) var(--rialto-space-sm)',
                      borderBottom: '1px solid var(--rialto-border)',
                      fontSize: 'var(--rialto-text-sm)',
                      color: 'var(--rialto-text-secondary)',
                    }}
                  >
                    Telemetry channel {i + 1} —{' '}
                    {
                      [
                        'Speed',
                        'RPM',
                        'Throttle',
                        'Brake',
                        'Steering',
                        'G-Force Lat',
                        'G-Force Long',
                        'Oil Temp',
                        'Water Temp',
                        'Tire Temp FL',
                        'Tire Temp FR',
                        'Tire Temp RL',
                        'Tire Temp RR',
                        'Fuel Flow',
                        'ERS Deploy',
                      ][i]
                    }
                  </div>
                ))}
              </ScrollArea>
            </Card>
            <Card style={{ flex: 1 }}>
              <ScrollArea maxHeight={200}>
                <p
                  style={{
                    padding: 'var(--rialto-space-sm)',
                    fontSize: 'var(--rialto-text-sm)',
                    color: 'var(--rialto-text-secondary)',
                    margin: 0,
                  }}
                >
                  Short content that doesn&apos;t scroll — the scrollbar only appears
                  when needed.
                </p>
              </ScrollArea>
            </Card>
          </div>
        </Section>

        {/* ── 47 Timeline ────────────────────────── */}
        <Section
          number="47"
          title="Timeline"
          description="Vertical event log with connected nodes. Gold fills for completed events, glowing ring for the active moment, and muted upcoming items. Mono-spaced timestamps on the left channel."
        >
          <div className={styles.row} style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <span
                className={styles.rowLabel}
                style={{
                  display: 'block',
                  marginBottom: 'var(--rialto-space-sm)',
                }}
              >
                Full
              </span>
              <Timeline
                events={[
                  {
                    title: 'Session initialized',
                    timestamp: '14:02',
                    status: 'completed',
                    description: 'Telemetry link established with pit wall',
                  },
                  {
                    title: 'Systems check passed',
                    timestamp: '14:04',
                    status: 'completed',
                  },
                  {
                    title: 'Warm-up lap',
                    timestamp: '14:06',
                    status: 'completed',
                    description:
                      'Tyre pressures nominal — 21.4 PSI front, 19.8 PSI rear',
                  },
                  {
                    title: 'Qualifying — hot lap',
                    timestamp: '14:08',
                    status: 'active',
                    description: 'Sector 1 purple, sector 2 in progress',
                  },
                  { title: 'Cool-down lap', status: 'upcoming' },
                  { title: 'Debrief', status: 'upcoming' },
                ]}
              />
            </div>
            <div style={{ flex: 1 }}>
              <span
                className={styles.rowLabel}
                style={{
                  display: 'block',
                  marginBottom: 'var(--rialto-space-sm)',
                }}
              >
                Compact
              </span>
              <Timeline
                compact
                events={[
                  {
                    title: 'Build started',
                    timestamp: '09:31',
                    status: 'completed',
                  },
                  {
                    title: 'Tests passed',
                    timestamp: '09:33',
                    status: 'completed',
                  },
                  {
                    title: 'Deploy to staging',
                    timestamp: '09:34',
                    status: 'completed',
                  },
                  { title: 'Smoke tests', timestamp: '09:35', status: 'error' },
                  { title: 'Rollback', status: 'upcoming' },
                ]}
              />
            </div>
          </div>
        </Section>

        {/* ━━ Tokens ━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className={styles.categoryDivider}>
          <span className={styles.categoryLabel}>Tokens</span>
        </div>

        {/* ── 48 Motion ────────────────────────── */}
        <Section
          number="48"
          title="Motion"
          description="Two motion personalities. Precision easing for instant-feeling UI transitions. Spring physics for organic, physical movements. Click each dot to compare."
        >
          <div className={styles.motionDemo}>
            <div
              role="button"
              tabIndex={0}
              className={styles.motionCard}
              onClick={() => setMotionPrecisionActive((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setMotionPrecisionActive((v) => !v);
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              <span className={styles.motionLabel}>Precision</span>
              <div className={styles.motionTrack}>
                <motion.div
                  className={styles.motionDot}
                  style={{
                    background: 'var(--rialto-surface-matte)',
                    border: '1px solid var(--rialto-border-strong)',
                    boxShadow: '0 1px 3px rgb(26 25 24 / 0.15)',
                  }}
                  animate={{
                    left: motionPrecisionActive ? 'calc(100% - 24px)' : 0,
                  }}
                  transition={precision}
                />
              </div>
              <p className={styles.motionDescription}>
                0.15s cubic-bezier — crisp, mechanical, like a rotary click
              </p>
            </div>

            <div
              role="button"
              tabIndex={0}
              className={styles.motionCard}
              onClick={() => setMotionSpringActive((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setMotionSpringActive((v) => !v);
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              <span className={styles.motionLabel}>Spring</span>
              <div className={styles.motionTrack}>
                <motion.div
                  className={styles.motionDot}
                  style={{
                    background: 'var(--rialto-accent)',
                    border: '1px solid var(--rialto-accent)',
                    boxShadow: '0 1px 3px rgb(196 146 42 / 0.3)',
                  }}
                  animate={{
                    left: motionSpringActive ? 'calc(100% - 24px)' : 0,
                  }}
                  transition={spring}
                />
              </div>
              <p className={styles.motionDescription}>
                Spring physics — organic overshoot, physical detent feel
              </p>
            </div>
          </div>

          {/* ── Auto-looping demos ─────────────── */}
          <div className={styles.motionDemo}>
            <div className={styles.motionCard}>
              <span className={styles.motionLabel}>Stagger Cascade</span>
              <div className={styles.staggerBars}>
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <motion.div
                    key={i}
                    className={styles.staggerBar}
                    animate={{ scaleY: staggerPhase ? 1 : 0.15 }}
                    transition={{
                      ...precision,
                      delay: i * 0.06,
                    }}
                  />
                ))}
              </div>
              <p className={styles.motionDescription}>
                Precision stagger — sequential 60ms delay, crisp easing on each
                bar
              </p>
            </div>

            <div className={styles.motionCard}>
              <span className={styles.motionLabel}>Spring Settle</span>
              <div className={styles.springSettleTrack}>
                <motion.div
                  className={styles.springSettleDot}
                  animate={{ left: springLoop ? 'calc(100% - 20px)' : '0px' }}
                  transition={spring}
                  onAnimationComplete={() => setSpringLoop((v) => !v)}
                />
              </div>
              <p className={styles.motionDescription}>
                Continuous spring — watch the overshoot and settle at each end
              </p>
            </div>
          </div>
        </Section>

        {/* ── 49 Typography ───────────────────── */}
        <Section
          number="49"
          title="Typography"
          description="DM Sans — a humanist sans-serif with warm optical proportions. Minor third scale (1.2 ratio). Three weights only: light, regular, medium."
        >
          {TYPE_SCALE.map(({ token, label, text, weight, tracking }) => (
            <div key={token} className={styles.typeSpecimen}>
              <p
                style={{
                  fontSize: `var(${token})`,
                  fontWeight: weight,
                  letterSpacing: tracking,
                  lineHeight: 'var(--rialto-leading-tight)',
                }}
              >
                {text}
              </p>
              <span className={styles.typeLabel}>{label}</span>
            </div>
          ))}
        </Section>

        {/* ── 50 Color ──────────────────────────── */}
        <Section
          number="50"
          title="Color"
          description="Warm neutral aluminum palette. Gold accent used surgically — focus rings, active states, primary actions. Never decorative."
        >
          {/* Surface palette — continuous strip */}
          <div className={styles.surfacePalette}>
            {SURFACES.map(({ name, color }) => (
              <div
                key={name}
                className={styles.surfaceStrip}
                style={{ background: color }}
              >
                <span className={styles.surfaceStripLabel}>{name}</span>
              </div>
            ))}
          </div>

          {/* Full color palette — grouped */}
          {COLOR_PALETTE.map(({ group, tokens }) => (
            <div key={group} className={styles.paletteGroup}>
              <p className={styles.paletteGroupLabel}>{group}</p>
              <div className={styles.swatchGrid}>
                {tokens.map(({ name, value }) => (
                  <div key={name} className={styles.swatch}>
                    <div
                      className={styles.swatchColor}
                      style={{ background: `var(--rialto-${name})` }}
                    />
                    <span className={styles.swatchName}>{name}</span>
                    <span className={styles.swatchValue}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Section>

        {/* ── 51 Spacing ─────────────────────────── */}
        <Section
          number="51"
          title="Spacing"
          description="4px base unit. Nine steps from 2xs (4px) to 4xl (96px) — all spacing derives from these tokens."
        >
          {SPACING_SCALE.map(({ token, value }) => (
            <div key={token} className={styles.spacingRow}>
              <span className={styles.spacingLabel}>
                --rialto-space-{token}
              </span>
              <div
                className={styles.spacingBar}
                style={{ width: `var(--rialto-space-${token})` }}
              />
              <span className={styles.spacingValue}>{value}</span>
            </div>
          ))}
        </Section>

        {/* ── 52 Radius ──────────────────────────── */}
        <Section
          number="52"
          title="Radius"
          description="Hierarchy-based border radius. Small elements get sharp corners, containers get soft, pills get full round."
        >
          <div className={styles.radiusGrid}>
            {RADIUS_SCALE.map(({ token, value, usage }) => (
              <div key={token} className={styles.radiusItem}>
                <div
                  className={styles.radiusBox}
                  style={{ borderRadius: `var(--rialto-radius-${token})` }}
                />
                <span className={styles.radiusName}>
                  {token} · {value}
                </span>
                <span className={styles.radiusUsage}>{usage}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 53 Shadows ─────────────────────────── */}
        <Section
          number="53"
          title="Shadows"
          description="Four shadow tokens covering elevation, press states, focus rings, and glass depth."
        >
          <div className={styles.shadowGrid}>
            {SHADOW_TOKENS.map(({ token, description }) => (
              <div
                key={token}
                className={styles.shadowCard}
                style={{ boxShadow: `var(--rialto-shadow-${token})` }}
              >
                <span className={styles.shadowName}>
                  --rialto-shadow-{token}
                </span>
                <span className={styles.shadowDescription}>{description}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 54 Surfaces ────────────────────────── */}
        <Section
          number="54"
          title="Surfaces"
          description="Live-rendered material compositions from surfaces.module.css — aluminum, glass, recessed, and dark."
        >
          <div className={styles.materialGrid}>
            {MATERIAL_SWATCHES.map(({ name, label, description, style }) => (
              <div
                key={name}
                className={`${styles.materialSwatch} ${styles[style as keyof typeof styles]}`}
              >
                <span className={styles.materialName}>{label}</span>
                <span className={styles.materialDescription}>
                  {description}
                </span>
              </div>
            ))}
          </div>

          <div className={styles.borderDemo}>
            <div className={styles.borderLine}>
              <div
                className={styles.borderSample}
                style={{ background: 'var(--rialto-border)' }}
              />
              <span className={styles.borderLabel}>--rialto-border</span>
            </div>
            <div className={styles.borderLine}>
              <div
                className={styles.borderSample}
                style={{ background: 'var(--rialto-border-strong)' }}
              />
              <span className={styles.borderLabel}>--rialto-border-strong</span>
            </div>
          </div>
        </Section>

        {/* ── 55 Icon Vocabulary ──────────────── */}
        <Section
          number="55"
          title="Icon Vocabulary"
          description="Canonical concept-to-icon mapping using Lucide React. Every UI concept has exactly one icon — use getIcon('concept') for lookups."
        >
          {iconCategories.map((category) => (
            <div key={category}>
              <div
                className={styles.rowLabel}
                style={{ marginBottom: 'var(--rialto-space-xs)' }}
              >
                {category}
              </div>
              <div className={styles.iconGrid}>
                {getIconsByCategory(category).map(
                  ({ concept, label, icon: Icon }) => (
                    <div key={concept} className={styles.iconCell}>
                      <Icon size={20} className={styles.iconPreview} />
                      <span className={styles.iconLabel}>{label}</span>
                      <span className={styles.iconConcept}>{concept}</span>
                    </div>
                  )
                )}
              </div>
            </div>
          ))}
        </Section>

        {/* ━━ Demo Pages ━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className={styles.categoryDivider}>
          <span className={styles.categoryLabel}>Demo Pages</span>
        </div>

        <Section
          number=""
          title="Full-Page Demos"
          description="Complete page layouts built with Rialto components — authentication flows, dashboards, and CRUDL data management. Each page demonstrates real-world composition patterns."
        >
          <div className={styles.demoPageGrid}>
            <Link to="/login" className={styles.demoPageCard}>
              <div className={styles.demoPageIcon}>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <span className={styles.demoPageTitle}>Sign In</span>
              <span className={styles.demoPageDescription}>
                Authentication form with validation, error states, and social
                login
              </span>
            </Link>

            <Link to="/signup" className={styles.demoPageCard}>
              <div className={styles.demoPageIcon}>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" y1="8" x2="19" y2="14" />
                  <line x1="22" y1="11" x2="16" y2="11" />
                </svg>
              </div>
              <span className={styles.demoPageTitle}>Sign Up</span>
              <span className={styles.demoPageDescription}>
                Registration flow with multi-field form and password
                requirements
              </span>
            </Link>

            <Link to="/dashboard" className={styles.demoPageCard}>
              <div className={styles.demoPageIcon}>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </div>
              <span className={styles.demoPageTitle}>Dashboard</span>
              <span className={styles.demoPageDescription}>
                Stats, charts, and data overview with cards and layout
                composition
              </span>
            </Link>

            <Link to="/drivers" className={styles.demoPageCard}>
              <div className={styles.demoPageIcon}>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 6h18M3 12h18M3 18h18" />
                </svg>
              </div>
              <span className={styles.demoPageTitle}>List</span>
              <span className={styles.demoPageDescription}>
                Data table with pagination, search, filtering, and bulk actions
              </span>
            </Link>

            <Link to="/drivers/new" className={styles.demoPageCard}>
              <div className={styles.demoPageIcon}>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <span className={styles.demoPageTitle}>Create</span>
              <span className={styles.demoPageDescription}>
                Multi-field form with validation, radio groups, and submit
                feedback
              </span>
            </Link>

            <Link to="/drivers/1" className={styles.demoPageCard}>
              <div className={styles.demoPageIcon}>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </div>
              <span className={styles.demoPageTitle}>Read</span>
              <span className={styles.demoPageDescription}>
                Detail view with data display, badges, stats, and action buttons
              </span>
            </Link>

            <Link to="/drivers/1/edit" className={styles.demoPageCard}>
              <div className={styles.demoPageIcon}>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </div>
              <span className={styles.demoPageTitle}>Update</span>
              <span className={styles.demoPageDescription}>
                Edit form with dirty state tracking, discard dialog, and
                optimistic save
              </span>
            </Link>

            <Link to="/teams/new" className={styles.demoPageCard}>
              <div className={styles.demoPageIcon}>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="3" width="20" height="18" rx="2" />
                  <path d="M8 7h8M8 12h8M8 17h4" />
                </svg>
              </div>
              <span className={styles.demoPageTitle}>Wizard</span>
              <span className={styles.demoPageDescription}>
                Multi-step form with Steps navigation, per-step validation, and
                review summary
              </span>
            </Link>

            <Link to="/layouts" className={styles.demoPageCard}>
              <div className={styles.demoPageIcon}>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="4" rx="1" />
                  <rect x="3" y="10" width="18" height="7" rx="1" />
                  <rect x="3" y="20" width="18" height="1" rx="0.5" />
                </svg>
              </div>
              <span className={styles.demoPageTitle}>Layouts</span>
              <span className={styles.demoPageDescription}>
                Page scaffolding with Hero, PageHeader, and Footer components
              </span>
            </Link>
          </div>
        </Section>

        {/* ── Footer ───────────────────────────── */}
        <footer className={styles.footer}>
          <p className={styles.footerLogo}>Rialto</p>
          <p className={styles.footerText}>Design system</p>
        </footer>
      </div>
    </RialtoProvider>
  );
}
