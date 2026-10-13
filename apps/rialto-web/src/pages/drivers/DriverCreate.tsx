import { useNavigate } from "react-router";
import { useToast } from "@mattbutlerengineering/rialto";
import { useDrivers } from "./DriverContext";
import { DriverForm, type DriverFormValues } from "./DriverForm";
import { DriverLayout } from "./DriverLayout";
import { DEMO_ROUTES } from "../../data/demo-routes";

/** Simulated network delay — everything on this page is demo-only. */
const SIMULATED_NETWORK_MS = 400;

export function DriverCreate() {
  const { addDriver } = useDrivers();
  const { toast } = useToast();
  const navigate = useNavigate();

  function handleSubmit(values: DriverFormValues) {
    setTimeout(() => {
      const driver = addDriver({ ...values, points: 0, wins: 0, podiums: 0 });
      toast({ title: `${driver.name} added`, variant: "success" });
      navigate(DEMO_ROUTES.driver(driver.id));
    }, SIMULATED_NETWORK_MS);
  }

  return (
    <DriverLayout
      title="Add Driver"
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Drivers", href: DEMO_ROUTES.drivers },
        { label: "Add Driver" },
      ]}
    >
      <DriverForm
        submitLabel="Add Driver"
        submittingLabel="Adding..."
        showPlaceholders
        onSubmit={handleSubmit}
        onCancel={() => navigate(DEMO_ROUTES.drivers)}
      />
    </DriverLayout>
  );
}
