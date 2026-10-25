import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Badge,
  Card,
  Divider,
  Select,
  Skeleton,
  Stack,
  Text,
  Toggle,
} from "@mattbutlerengineering/rialto";
import type { TeamMember, TeamRole, VenueTeam } from "@mbe/types";
import { useVenue } from "../../contexts/VenueContext.js";
import {
  useSetHostEmergencyClose,
  useSetTeamRole,
  useVenueTeam,
} from "../../hooks/useVenueTeam.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import { ErrorRetryBanner } from "../ErrorRetryBanner.js";
import styles from "./TeamRolesCard.module.css";

const ROLE_KEYS = {
  manager: "settings.team.roleManager",
  host: "settings.team.roleHost",
} as const satisfies Record<TeamRole, string>;

interface MemberRowProps {
  readonly member: TeamMember;
  readonly editable: boolean;
  readonly disabled: boolean;
  readonly onRoleChange: (member: TeamMember, role: TeamRole) => void;
}

/** One member: their role as a Select for a Manager, as a badge for a Host. */
function MemberRow({ member, editable, disabled, onRoleChange }: MemberRowProps) {
  const { t } = useTranslation();
  const options = (Object.keys(ROLE_KEYS) as TeamRole[]).map((role) => ({
    value: role,
    label: t(ROLE_KEYS[role]),
  }));

  return (
    <li className={styles.member}>
      <Text className={styles.identity}>
        <Text variant="body" color="primary">
          {member.userSub}
        </Text>
        {member.isViewer && (
          <Badge size="sm" variant="accent">
            {t("settings.team.you")}
          </Badge>
        )}
      </Text>
      {editable ? (
        <Select
          aria-label={t("settings.team.roleLabel", { member: member.userSub })}
          options={options}
          value={member.role}
          onChange={(value) => onRoleChange(member, value as TeamRole)}
          disabled={disabled}
        />
      ) : (
        <Badge size="sm">{t(ROLE_KEYS[member.role])}</Badge>
      )}
    </li>
  );
}

interface TeamBodyProps {
  readonly venueId: string;
  readonly team: VenueTeam;
}

function TeamBody({ venueId, team }: TeamBodyProps) {
  const { t } = useTranslation();
  const setRole = useSetTeamRole();
  const setGrant = useSetHostEmergencyClose();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isManager = team.viewerRole === "manager";

  const save = async (write: () => Promise<unknown>) => {
    setIsSaving(true);
    setSaveError(null);
    try {
      await write();
    } catch (err) {
      setSaveError(describeApiError(err).detail);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRoleChange = (member: TeamMember, role: TeamRole) => {
    if (role === member.role) return;
    void save(() => setRole.mutateAsync({ venueId, userSub: member.userSub, role }));
  };

  return (
    <Stack gap="md">
      {saveError && <Alert variant="error">{saveError}</Alert>}
      {team.members.length === 0 ? (
        <Text variant="body" color="secondary">
          {t("settings.team.empty")}
        </Text>
      ) : (
        <ul className={styles.members}>
          {team.members.map((member) => (
            <MemberRow
              key={member.userSub}
              member={member}
              editable={isManager}
              disabled={isSaving}
              onRoleChange={handleRoleChange}
            />
          ))}
        </ul>
      )}
      <Divider spacing="compact" />
      {isManager ? (
        <div className={styles.toggleRow}>
          <Toggle
            label={t("settings.team.emergencyClose")}
            checked={team.hostEmergencyClose}
            onCheckedChange={(enabled) =>
              void save(() => setGrant.mutateAsync({ venueId, enabled }))
            }
            disabled={isSaving}
          />
          <Text variant="caption" color="secondary">
            {t("settings.team.emergencyCloseHint")}
          </Text>
        </div>
      ) : (
        <Stack gap="xs">
          <Text variant="body" color="primary">
            {team.hostEmergencyClose
              ? t("settings.team.emergencyCloseOn")
              : t("settings.team.emergencyCloseOff")}
          </Text>
          <Text variant="caption" color="secondary">
            {t("settings.team.readOnly")}
          </Text>
        </Stack>
      )}
    </Stack>
  );
}

/**
 * Settings → Team (venue-availability, #7510): who is a Manager or a Host,
 * and whether Hosts can close the venue in an emergency. A Manager edits both;
 * a Host sees the same facts with nothing to edit (no disabled controls).
 */
export function TeamRolesCard() {
  const { t } = useTranslation();
  const { selectedVenueId } = useVenue();
  const { data: team, isLoading, error, refetch } = useVenueTeam({ venueId: selectedVenueId });

  let body;
  if (!selectedVenueId) {
    body = (
      <Text variant="body" color="secondary">
        {t("settings.team.noVenue")}
      </Text>
    );
  } else if (isLoading) {
    body = <Skeleton variant="text" width="100%" height={96} />;
  } else if (error || !team) {
    const failure = describeApiError(error);
    body = (
      <ErrorRetryBanner
        title={t("settings.team.loadError")}
        error={failure.detail}
        details={failure.raw}
        onRetry={() => void refetch()}
      />
    );
  } else {
    body = <TeamBody venueId={selectedVenueId} team={team} />;
  }

  return (
    <Card title={t("settings.team.title")}>
      <Stack gap="md">
        <Text variant="caption" color="secondary">
          {t("settings.team.description")}
        </Text>
        {body}
      </Stack>
    </Card>
  );
}
