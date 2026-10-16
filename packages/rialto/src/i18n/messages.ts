/**
 * Every user-visible string Rialto renders by itself, as one typed dictionary
 * (ADR-028). en-US is the inline default; other locales ship as their own
 * subpath modules typed `RialtoMessages`, so a missing key fails typecheck.
 *
 * Keys are added as components migrate onto `useRialtoLocale()` — each new key
 * lands with its value in every locale module. Interpolated entries are
 * functions, e.g. `removeItem: (label: string) => string`.
 */
export interface RialtoMessages {
  /** Accessible name of a control that dismisses a notice (Alert, Banner, Toast). */
  readonly dismiss: string;
  /** Accessible name of a control that closes a surface (Drawer, Popover). */
  readonly close: string;
  /** Accessible name of the Dialog close button. */
  readonly closeDialog: string;
  /** Fallback accessible name of a Dialog with no title. */
  readonly dialog: string;
  /** Fallback accessible name of a Drawer with no title. */
  readonly drawer: string;
  /** Fallback accessible name of a Popover with no title. */
  readonly popover: string;
  /** Accessible name of a HoverCard's preview surface. */
  readonly preview: string;
  /** Accessible name of the Toast region. */
  readonly notifications: string;
  /** Default ConfirmDialog confirm button label. */
  readonly confirm: string;
  /** Default ConfirmDialog cancel button label. */
  readonly cancel: string;
  /** Accessible name of the Pagination nav. */
  readonly pagination: string;
  /** Pagination previous-page button. */
  readonly previousPage: string;
  /** Pagination next-page button. */
  readonly nextPage: string;
  /** Accessible name of a Pagination page button. */
  readonly pageNumber: (page: number) => string;
  /** Polite live-region announcement after a Pagination page change. */
  readonly pageStatus: (page: number, total: number) => string;
  /** Calendar and DateRange previous-month button. */
  readonly previousMonth: string;
  /** Calendar and DateRange next-month button. */
  readonly nextMonth: string;
  /** Accessible name of a DatePicker with no label. */
  readonly chooseDate: string;
  /** Accessible name of a DateRangePicker with no label. */
  readonly chooseDateRange: string;
  /** Accessible name of a TimePicker with no label. */
  readonly chooseTime: string;
  /** NumberInput decrement button. */
  readonly decrease: string;
  /** NumberInput increment button. */
  readonly increase: string;
  /** Marker after the label of an optional NumberInput. */
  readonly optional: string;
  /** Accessible name of the Breadcrumb nav. */
  readonly breadcrumb: string;
  /** Accessible name of the Steps list. */
  readonly progressSteps: string;
  /** Accessible name of the Timeline list. */
  readonly timeline: string;
  /** Accessible name of the Sidebar nav. */
  readonly sidebarNavigation: string;
  /** Sidebar toggle while collapsed. */
  readonly expandSidebar: string;
  /** Sidebar toggle while expanded. */
  readonly collapseSidebar: string;
  /** Default accessible name of Navbar and NavigationMenu. */
  readonly mainNavigation: string;
  /** Navbar submenu chevron button. */
  readonly toggleSubmenu: string;
  /** Default Navbar search placeholder. */
  readonly searchPlaceholder: string;
  /** Accessible name of the GlobalNav. */
  readonly globalNavigation: string;
  /** GlobalNav mobile menu button while closed. */
  readonly openMenu: string;
  /** GlobalNav mobile menu button while open. */
  readonly closeMenu: string;
  /** Accessible name of a ScrollArea region. */
  readonly scrollableContent: string;
  /** Accessible name of a SkeletonGroup. */
  readonly loadingContent: string;
  /** Fallback accessible name of the ImageUpload tile. */
  readonly uploadImage: string;
  /** Fallback alt text of an uploaded ImageUpload preview. */
  readonly uploadedImage: string;
  /** ImageUpload progress bar name. */
  readonly uploadProgress: string;
  /** ImageUpload completion status. */
  readonly uploadComplete: string;
  /** ImageUpload replace button. */
  readonly replaceImage: string;
  /** ImageUpload empty-tile label. */
  readonly addImage: string;
  /** ImageUpload validation message: file larger than `maxSize`. */
  readonly fileTooLarge: (max: string, actual: string) => string;
  /** ImageUpload validation message: file type outside `accept`. */
  readonly fileTypeNotAccepted: (accept: string) => string;
  /** Accessible name of a control that removes a tag or chip, e.g. "Remove VIP". */
  readonly removeItem: (label: string) => string;
  /** Accessible name of an AvatarGroup overflow count. */
  readonly moreCount: (count: number) => string;
  /** Accessible name of one PinInput digit cell (1-based `index`). */
  readonly digitOf: (index: number, length: number) => string;
  /** Chalkboard item sold-out marker. */
  readonly soldOut: string;
  /** DataTable select-all checkbox label (screen-reader only). */
  readonly selectAllRows: string;
  /** DataTable single-select column header (screen-reader only). */
  readonly selectRow: string;
  /** ErrorBoundary default heading. */
  readonly errorTitle: string;
  /** ErrorBoundary default message. */
  readonly errorMessage: string;
  /** ErrorBoundary refresh button. */
  readonly refreshPage: string;
  /** Accessible name of the CommandPalette dialog. */
  readonly commandPalette: string;
  /** Accessible name of the CommandPalette search input. */
  readonly searchCommands: string;
  /** Accessible name of the CommandPalette results list. */
  readonly commandResults: string;
  /** CommandPalette empty state. */
  readonly noResults: string;
  /** CommandPalette footer hint beside the arrow keys. */
  readonly navigateHint: string;
  /** CommandPalette footer hint beside the enter key. */
  readonly selectHint: string;
  /** CommandPalette footer hint beside the escape key. */
  readonly closeHint: string;
  /** Generic busy-region accessible name. */
  readonly loading: string;
  /** Retry button (ChatPanel error). */
  readonly tryAgain: string;
  /** ChatPanel pending-action confirm button name. */
  readonly confirmAction: string;
  /** ChatPanel pending-action cancel button name. */
  readonly cancelAction: string;
  /** ChatPanel message input name. */
  readonly chatInput: string;
  /** ChatPanel message input placeholder. */
  readonly chatPlaceholder: string;
  /** ChatPanel send button. */
  readonly send: string;
  /** ChatPanel drawer title. */
  readonly chat: string;
  /** ChatPanel tool denial, rendered after the bold tool name. */
  readonly toolBlocked: (reason: string) => string;
  /** TapeChart list-row fallback name when a reservation has no guest. */
  readonly reservation: string;
  /** TapeChart list-row date span, e.g. "Mon, Jan 5 to Wed, Jan 7". */
  readonly dateSpan: (start: string, end: string) => string;
  /** Select trigger placeholder when nothing is chosen. */
  readonly selectPlaceholder: string;
  /** Combobox loading state. */
  readonly loadingEllipsis: string;
  /** Combobox and Autocomplete empty list. */
  readonly noOptions: string;
  /** Table and DataTable empty body. */
  readonly noData: string;
  /** CommandPalette search placeholder. */
  readonly searchCommandsPlaceholder: string;
  /** Accessible name of the Footer link columns. */
  readonly footerLinks: string;
  /** MasterOverride switch-face text when off. */
  readonly standby: string;
  /** MasterOverride switch-face text when on. */
  readonly engaged: string;
  /** MasterOverride safety-cover text. */
  readonly liftToArm: string;
  /** MasterOverride live-region text while the switch is held. */
  readonly holdToArm: (label: string) => string;
  /** MasterOverride live-region text once the hold completes. */
  readonly switchEngaged: (label: string) => string;
  /** MasterOverride live-region text when a hold is released early. */
  readonly armingCancelled: string;
  /** MasterOverride status with the cover closed; `state` is the switch face text. */
  readonly coverClosedStatus: (label: string, state: string) => string;
  /** MasterOverride status with the cover open; `state` is the switch face text. */
  readonly coverOpenStatus: (label: string, state: string) => string;
  /** MasterOverride cover button name while armed. */
  readonly closeSafetyCover: (label: string) => string;
  /** MasterOverride cover button name while safe. */
  readonly liftSafetyCover: (label: string) => string;
}

export const enUS: RialtoMessages = {
  dismiss: "Dismiss",
  close: "Close",
  closeDialog: "Close dialog",
  dialog: "Dialog",
  drawer: "Drawer",
  popover: "Popover",
  preview: "Preview",
  notifications: "Notifications",
  confirm: "Confirm",
  cancel: "Cancel",
  pagination: "Pagination",
  previousPage: "Previous page",
  nextPage: "Next page",
  pageNumber: (page) => `Page ${page}`,
  pageStatus: (page, total) => `Page ${page} of ${total}`,
  previousMonth: "Previous month",
  nextMonth: "Next month",
  chooseDate: "Choose date",
  chooseDateRange: "Choose date range",
  chooseTime: "Choose time",
  decrease: "Decrease",
  increase: "Increase",
  optional: "(optional)",
  breadcrumb: "Breadcrumb",
  progressSteps: "Progress steps",
  timeline: "Timeline",
  sidebarNavigation: "Sidebar navigation",
  expandSidebar: "Expand sidebar",
  collapseSidebar: "Collapse sidebar",
  mainNavigation: "Main navigation",
  toggleSubmenu: "Toggle submenu",
  searchPlaceholder: "Search...",
  globalNavigation: "Global navigation",
  openMenu: "Open menu",
  closeMenu: "Close menu",
  scrollableContent: "Scrollable content",
  loadingContent: "Loading content",
  uploadImage: "Upload image",
  uploadedImage: "Uploaded image",
  uploadProgress: "Upload progress",
  uploadComplete: "Upload complete",
  replaceImage: "Replace",
  addImage: "Add image",
  fileTooLarge: (max, actual) => `File exceeds maximum size of ${max} — this file is ${actual}`,
  fileTypeNotAccepted: (accept) => `File type not accepted. Accepted: ${accept}`,
  removeItem: (label) => `Remove ${label}`,
  moreCount: (count) => `${count} more`,
  digitOf: (index, length) => `Digit ${index} of ${length}`,
  soldOut: "sold out",
  selectAllRows: "Select all rows",
  selectRow: "Select",
  errorTitle: "Something went wrong",
  errorMessage: "An unexpected error occurred. Please try refreshing the page.",
  refreshPage: "Refresh page",
  commandPalette: "Command palette",
  searchCommands: "Search commands",
  commandResults: "Command results",
  noResults: "No results found",
  navigateHint: "navigate",
  selectHint: "select",
  closeHint: "close",
  loading: "Loading",
  tryAgain: "Try again",
  confirmAction: "Confirm action",
  cancelAction: "Cancel action",
  chatInput: "Chat input",
  chatPlaceholder: "Ask about availability, reservations...",
  send: "Send",
  chat: "Chat",
  toolBlocked: (reason) => `was blocked: ${reason}`,
  reservation: "Reservation",
  dateSpan: (start, end) => `${start} to ${end}`,
  selectPlaceholder: "Select…",
  loadingEllipsis: "Loading…",
  noOptions: "No results",
  noData: "No data",
  searchCommandsPlaceholder: "Search commands…",
  footerLinks: "Footer links",
  standby: "STANDBY",
  engaged: "ENGAGED",
  liftToArm: "LIFT TO ARM",
  holdToArm: (label) => `Hold to arm ${label}`,
  switchEngaged: (label) => `${label} engaged`,
  armingCancelled: "Arming cancelled",
  coverClosedStatus: (label, state) => `${label} safety cover closed. Switch is ${state}.`,
  coverOpenStatus: (label, state) => `${label} safety cover open. Switch is ${state}.`,
  closeSafetyCover: (label) => `Close safety cover for ${label}`,
  liftSafetyCover: (label) => `Lift safety cover for ${label}`,
};
