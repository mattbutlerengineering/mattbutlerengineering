import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { Button, ConfirmDialog, EmptyState, useToast } from "@mattbutlerengineering/rialto";
import { useDrivers } from "./DriverContext";
import { DriverForm, type DriverFormValues } from "./DriverForm";
import { DriverLayout } from "./DriverLayout";
import { DEMO_ROUTES } from "../../data/demo-routes";

/** Simulated network delay — everything on this page is demo-only. */
const SIMULATED_NETWORK_MS = 400;

export function DriverUpdate() {
  const { id } = useParams<{ id: string }>();
  const { getDriver, updateDriver } = useDrivers();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [discardDialog, setDiscardDialog] = useState(false);

  const driver = getDriver(id ?? "");

  if (!driver) {
    return (
      <DriverLayout
        title="Driver Not Found"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Drivers", href: DEMO_ROUTES.drivers },
          { label: "Not Found" },
        ]}
      >
        <EmptyState
          title="Driver not found"
          description="This driver may have been removed or the link is invalid."
          action={
            <Button variant="primary" size="sm" onClick={() => navigate(DEMO_ROUTES.drivers)}>
              View All Drivers
            </Button>
          }
        />
      </DriverLayout>
    );
  }

  const driverId = driver.id;

  function handleSubmit(values: DriverFormValues) {
    setTimeout(() => {
      updateDriver(driverId, values);
      toast({ title: `${values.name} updated`, variant: "success" });
      navigate(DEMO_ROUTES.driver(driverId));
    }, SIMULATED_NETWORK_MS);
  }

  function handleCancel(isDirty: boolean) {
    if (isDirty) setDiscardDialog(true);
    else navigate(DEMO_ROUTES.driver(driverId));
  }

  return (
    <DriverLayout
      title={`Edit ${driver.name}`}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Drivers", href: DEMO_ROUTES.drivers },
        { label: driver.name, href: DEMO_ROUTES.driver(driverId) },
        { label: "Edit" },
      ]}
    >
      <DriverForm
        initial={driver}
        submitLabel="Save Changes"
        submittingLabel="Saving..."
        requireChanges
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />

      {/* ── Discard confirmation ─────────────── */}
      <ConfirmDialog
        open={discardDialog}
        onConfirm={() => navigate(DEMO_ROUTES.driver(driverId))}
        onCancel={() => setDiscardDialog(false)}
        title="Discard changes?"
        description="You have unsaved changes that will be lost."
        confirmLabel="Discard"
        variant="destructive"
      />
    </DriverLayout>
  );
}
