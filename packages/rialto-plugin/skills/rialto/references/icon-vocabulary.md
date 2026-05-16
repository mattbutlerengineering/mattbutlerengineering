# Icon Vocabulary

Rialto maps UI concepts to Lucide React icons. Every concept has one canonical icon — use these instead of choosing ad-hoc.

---

## Usage

```tsx
// Direct import (tree-shakes to just the icons you use)
import { Save, Trash2, Plus } from "lucide-react";
<Button><Save size={16} /> Save</Button>

// Lookup by concept name (useful for dynamic/data-driven UIs)
import { getIcon } from "rialto";
const Icon = getIcon("save"); // → Save component
if (Icon) <Icon size={16} />;
```

---

## Sizing Conventions

| Context | Size |
|---------|------|
| Small buttons (sm) | 14px |
| Medium buttons | 16px |
| Standalone icons | 20px |
| Hero / empty state | 32–48px |

---

## Concept → Icon Mapping

### Navigation
| Concept | Lucide Icon |
|---------|-------------|
| `home` | Home |
| `back` | ArrowLeft |
| `forward` | ArrowRight |
| `menu` | Menu |
| `search` | Search |
| `external-link` | ExternalLink |
| `expand` | ChevronDown |
| `collapse` | ChevronRight |
| `more-actions` | MoreHorizontal |

### Actions
| Concept | Lucide Icon |
|---------|-------------|
| `save` | Save |
| `delete` | Trash2 |
| `edit` | SquarePen |
| `add` | Plus |
| `copy` | Copy |
| `share` | Share |
| `download` | Download |
| `upload` | Upload |
| `refresh` | RefreshCw |
| `undo` | Undo |
| `redo` | Redo |

### Communication
| Concept | Lucide Icon |
|---------|-------------|
| `email` | Mail |
| `message` | MessageCircle |
| `notification` | Bell |
| `send` | Send |
| `phone` | Phone |

### Status
| Concept | Lucide Icon |
|---------|-------------|
| `success` | CircleCheck |
| `error` | CircleX |
| `warning` | AlertTriangle |
| `info` | Info |
| `loading` | Loader |

### Content
| Concept | Lucide Icon |
|---------|-------------|
| `file` | File |
| `file-text` | FileText |
| `folder` | Folder |
| `folder-open` | FolderOpen |
| `image` | Image |
| `link` | Link2 |
| `clipboard` | Clipboard |

### User
| Concept | Lucide Icon |
|---------|-------------|
| `user` | User |
| `users` | Users |
| `user-add` | UserPlus |
| `settings` | Settings |
| `logout` | LogOut |

### Data
| Concept | Lucide Icon |
|---------|-------------|
| `filter` | Filter |
| `sort` | ArrowUpDown |
| `chart` | BarChart3 |
| `trending-up` | TrendingUp |
| `trending-down` | TrendingDown |
| `checklist` | ListChecks |

### Media
| Concept | Lucide Icon |
|---------|-------------|
| `play` | Play |
| `pause` | Pause |
| `camera` | Camera |
| `video` | Video |

### Commerce
| Concept | Lucide Icon |
|---------|-------------|
| `cart` | ShoppingCart |
| `credit-card` | CreditCard |
| `dollar` | DollarSign |
| `package` | Package |
| `tag` | Tag |

---

## Helper Functions

| Export | Description |
|--------|------------|
| `iconVocabulary` | Full `readonly IconEntry[]` array (57 entries) |
| `getIcon(concept)` | Returns `LucideIcon \| undefined` for a concept string |
| `getIconsByCategory(cat)` | Returns `readonly IconEntry[]` filtered by category |
| `iconCategories` | Ordered `readonly IconCategory[]` (9 categories) |
