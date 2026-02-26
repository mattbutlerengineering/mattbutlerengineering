import { createContext, useContext } from 'react';

export interface Driver {
  id: string;
  name: string;
  number: number;
  team: string;
  nationality: string;
  status: 'active' | 'reserve' | 'retired';
  points: number;
  wins: number;
  podiums: number;
}

interface DriverContextValue {
  drivers: Driver[];
  getDriver: (id: string) => Driver | undefined;
  addDriver: (driver: Omit<Driver, 'id'>) => Driver;
  updateDriver: (id: string, updates: Partial<Omit<Driver, 'id'>>) => void;
  deleteDriver: (id: string) => void;
  restoreDriver: (driver: Driver) => void;
}

export const DriverContext = createContext<DriverContextValue | null>(null);

export function useDrivers() {
  const ctx = useContext(DriverContext);
  if (!ctx) throw new Error('useDrivers must be used within DriverProvider');
  return ctx;
}
