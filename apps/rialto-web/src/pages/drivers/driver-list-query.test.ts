import { describe, expect, it } from "vitest";
import type { Driver } from "./DriverContext";
import { filterDrivers, paginateDrivers, sortDrivers } from "./driver-list-query";

function driver(partial: Pick<Driver, "id" | "name" | "points"> & Partial<Driver>): Driver {
  return {
    number: 0,
    team: "Ferrari",
    nationality: "Test",
    status: "active",
    wins: 0,
    podiums: 0,
    ...partial,
  };
}

const DRIVERS: Driver[] = [
  driver({ id: "1", name: "Charles Leclerc", points: 308, number: 16, team: "Ferrari" }),
  driver({ id: "2", name: "Lewis Hamilton", points: 4829, number: 44, team: "Ferrari" }),
  driver({ id: "3", name: "Max Verstappen", points: 2586, number: 1, team: "Red Bull Racing" }),
  driver({ id: "4", name: "Lando Norris", points: 374, number: 4, team: "McLaren" }),
  driver({ id: "5", name: "Carlos Sainz", points: 1165, number: 55, team: "Williams" }),
  driver({ id: "6", name: "Oscar Piastri", points: 292, number: 81, team: "McLaren" }),
  driver({ id: "7", name: "George Russell", points: 492, number: 63, team: "Mercedes" }),
  driver({
    id: "8",
    name: "Sebastian Vettel",
    points: 3098,
    number: 5,
    team: "Red Bull Racing",
    status: "retired",
  }),
];

const PAGE_SIZE = 5;

describe("sortDrivers + paginateDrivers", () => {
  it("orders every driver by points before taking a page", () => {
    const sorted = sortDrivers(DRIVERS, { key: "points", direction: "asc" });
    const page1 = paginateDrivers(sorted, 1, PAGE_SIZE);
    const page2 = paginateDrivers(sorted, 2, PAGE_SIZE);

    expect(page1.rows.map((d) => d.name)).toEqual([
      "Oscar Piastri",
      "Charles Leclerc",
      "Lando Norris",
      "George Russell",
      "Carlos Sainz",
    ]);
    expect(page1.totalPages).toBe(2);
    expect(page2.rows.map((d) => [d.name, d.points])).toEqual([
      ["Max Verstappen", 2586],
      ["Sebastian Vettel", 3098],
      ["Lewis Hamilton", 4829],
    ]);
  });

  it("orders every driver by name before taking a page", () => {
    const sorted = sortDrivers(DRIVERS, { key: "name", direction: "asc" });
    const page1 = paginateDrivers(sorted, 1, PAGE_SIZE);
    const page2 = paginateDrivers(sorted, 2, PAGE_SIZE);

    expect(page1.rows.map((d) => d.name)).toEqual([
      "Carlos Sainz",
      "Charles Leclerc",
      "George Russell",
      "Lando Norris",
      "Lewis Hamilton",
    ]);
    expect(page2.rows.map((d) => d.name)).toEqual([
      "Max Verstappen",
      "Oscar Piastri",
      "Sebastian Vettel",
    ]);
  });

  it("sorts the filtered set, so a team filter still limits who is paged", () => {
    const filtered = filterDrivers(DRIVERS, "", "McLaren", "all");
    const sorted = sortDrivers(filtered, { key: "points", direction: "asc" });
    const page = paginateDrivers(sorted, 1, PAGE_SIZE);

    expect(page.rows.map((d) => d.name)).toEqual(["Oscar Piastri", "Lando Norris"]);
    expect(page.totalPages).toBe(1);
  });

  it("keeps the status filter when sorting", () => {
    const filtered = filterDrivers(DRIVERS, "", "all", "retired");
    const sorted = sortDrivers(filtered, { key: "name", direction: "asc" });

    expect(sorted.map((d) => d.name)).toEqual(["Sebastian Vettel"]);
  });
});
