import { useState, useCallback, type ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { DriverContext, type Driver } from "./DriverContext";

/* ── Mock data ───────────────────────────────── */

const INITIAL_DRIVERS: Driver[] = [
  {
    id: "1",
    name: "Charles Leclerc",
    number: 16,
    team: "Ferrari",
    nationality: "Monégasque",
    status: "active",
    points: 308,
    wins: 7,
    podiums: 32,
  },
  {
    id: "2",
    name: "Lewis Hamilton",
    number: 44,
    team: "Ferrari",
    nationality: "British",
    status: "active",
    points: 4829,
    wins: 103,
    podiums: 201,
  },
  {
    id: "3",
    name: "Max Verstappen",
    number: 1,
    team: "Red Bull Racing",
    nationality: "Dutch",
    status: "active",
    points: 2586,
    wins: 63,
    podiums: 111,
  },
  {
    id: "4",
    name: "Lando Norris",
    number: 4,
    team: "McLaren",
    nationality: "British",
    status: "active",
    points: 374,
    wins: 3,
    podiums: 22,
  },
  {
    id: "5",
    name: "Carlos Sainz",
    number: 55,
    team: "Williams",
    nationality: "Spanish",
    status: "active",
    points: 1165,
    wins: 4,
    podiums: 25,
  },
  {
    id: "6",
    name: "Oscar Piastri",
    number: 81,
    team: "McLaren",
    nationality: "Australian",
    status: "active",
    points: 292,
    wins: 2,
    podiums: 12,
  },
  {
    id: "7",
    name: "George Russell",
    number: 63,
    team: "Mercedes",
    nationality: "British",
    status: "active",
    points: 492,
    wins: 3,
    podiums: 16,
  },
  {
    id: "8",
    name: "Sebastian Vettel",
    number: 5,
    team: "Red Bull Racing",
    nationality: "German",
    status: "retired",
    points: 3098,
    wins: 53,
    podiums: 122,
  },
];

/* ── Provider (used as layout route) ─────────── */

export function DriverProvider({ children }: { children?: ReactNode }) {
  const [drivers, setDrivers] = useState<Driver[]>(INITIAL_DRIVERS);

  const getDriver = useCallback((id: string) => drivers.find((d) => d.id === id), [drivers]);

  const addDriver = useCallback((data: Omit<Driver, "id">) => {
    const driver: Driver = { ...data, id: crypto.randomUUID() };
    setDrivers((prev) => [...prev, driver]);
    return driver;
  }, []);

  const updateDriver = useCallback((id: string, updates: Partial<Omit<Driver, "id">>) => {
    setDrivers((prev) => prev.map((d) => (d.id === id ? { ...d, ...updates } : d)));
  }, []);

  const deleteDriver = useCallback((id: string) => {
    setDrivers((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const restoreDriver = useCallback((driver: Driver) => {
    setDrivers((prev) => {
      if (prev.some((d) => d.id === driver.id)) return prev;
      return [...prev, driver];
    });
  }, []);

  const value = {
    drivers,
    getDriver,
    addDriver,
    updateDriver,
    deleteDriver,
    restoreDriver,
  };

  return <DriverContext.Provider value={value}>{children ?? <Outlet />}</DriverContext.Provider>;
}
