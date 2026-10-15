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
};
